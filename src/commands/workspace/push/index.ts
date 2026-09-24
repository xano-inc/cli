import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import {resolve} from 'node:path'

import type {PushPolicyCheck} from '../../../utils/policy/types.js'

import BaseCommand from '../../../base-command.js'
import {parseDocument} from '../../../utils/document-parser.js'
import {
  executePush,
  FailedAfterImportError,
  type PushFlags,
  type PushResult,
  type PushTarget,
} from '../../../utils/multidoc-push.js'
import {policyCodeGuidance} from '../../../utils/policy/errors.js'
import {
  policyCheckWarning,
  policyDocumentSummary,
  policyExitCode,
  policySummary,
  pushEvidence,
} from '../../../utils/policy/feedback.js'
import {policyFilePushGuidance} from '../../../utils/policy/permission.js'

/** The `-o json` document for a push whose import ran: the import response and what was sent. */
function importDocument(result: PushResult): Record<string, unknown> {
  return {...result.response, documents: result.sent.length, imported: true, knowledge: result.knowledge}
}

/** The policy check the import answered with, if any. */
function policyCheck(result: PushResult): PushPolicyCheck | undefined {
  return result.response?.policy_check as PushPolicyCheck | undefined
}

export default class Push extends BaseCommand {
  static override description =
    '[IMPORTANT] ALWAYS run --dry-run first and show the user the output before pushing. Push local documents to a workspace. By default, only changed files are pushed (partial mode). Use --sync to push all files. Shows a preview of changes before pushing unless --force is specified. Use --dry-run to preview only.'
  static override examples = [
    `$ xano workspace push
Push from current directory (default partial mode)
`,
    `$ xano workspace push -d ./my-workspace
Push from a specific directory
`,
    `$ xano workspace push --sync
Push all files to the workspace
`,
    `$ xano workspace push --sync --delete
Push all files and delete remote objects not included
`,
    `$ xano workspace push --dry-run
Preview changes without pushing
`,
    `$ xano workspace push --force
Skip preview and push immediately (for CI/CD)
`,
    `$ xano workspace push -d ./output -w 40
Pushed 15 documents from ./output
`,
    `$ xano workspace push --profile production
Pushed 58 documents
`,
    `$ xano workspace push -b dev
Pushed 42 documents
`,
    `$ xano workspace push --no-records
Push schema only, skip importing table records
`,
    `$ xano workspace push --no-env
Push without overwriting environment variables
`,
    `$ xano workspace push --truncate
Truncate all table records before importing
`,
    `$ xano workspace push -i "**/func*"
Push only files matching the glob pattern
`,
    `$ xano workspace push -i "function/*" -i "table/*"
Push files matching multiple patterns
`,
    `$ xano workspace push -e "table/*"
Push all files except tables
`,
    `$ xano workspace push -i "function/*" -e "**/test*"
Push functions but exclude test files
`,
    `$ xano workspace push -i "knowledge/**"
Push only knowledge files (agents.md / skills / docs)
`,
    `$ xano workspace push -m "Tightened the auth policies"
Label the Version History entry of each policy this push changes; other objects get no message
`,
    `$ xano workspace push --sync --delete
Full sync including knowledge files; removes server objects not present locally
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch name (optional if set in profile, defaults to live)',
      required: false,
    }),
    delete: Flags.boolean({
      default: false,
      description:
        '[CRITICAL] STOP and confirm with the user before running. Delete workspace objects not included in the push (requires --sync).',
      required: false,
    }),
    directory: Flags.string({
      char: 'd',
      default: '.',
      description: 'Directory containing documents to push (defaults to current directory)',
      required: false,
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'Show preview of changes without pushing (exit after preview)',
      required: false,
    }),
    env: Flags.boolean({
      default: false,
      description: 'Include environment variables in import',
      required: false,
    }),
    exclude: Flags.string({
      char: 'e',
      description:
        'Glob pattern to exclude files (e.g. "table/*", "**/test*"). Matched against relative paths from the push directory.',
      multiple: true,
      required: false,
    }),
    force: Flags.boolean({
      default: false,
      description:
        '[CRITICAL] NEVER run without explicit user confirmation. Skips preview and confirmation prompt (for CI/CD pipelines).',
      required: false,
    }),
    guids: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Write server-assigned GUIDs back to local files (use --no-guids to skip)',
      required: false,
    }),
    include: Flags.string({
      char: 'i',
      description:
        'Glob pattern to include files (e.g. "**/func*", "table/*.xs"). Matched against relative paths from the push directory.',
      multiple: true,
      required: false,
    }),
    message: Flags.string({
      char: 'm',
      description: 'Labels the Version History entry of each policy this push changes; other objects get no message',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format; JSON retains the complete import and policy feedback',
      options: ['summary', 'json'],
      required: false,
    }),
    records: Flags.boolean({
      default: false,
      description:
        '[CRITICAL] STOP and ALWAYS run --dry-run first to show the user a preview before pushing live table records. Includes table records in import.',
      required: false,
    }),
    sync: Flags.boolean({
      default: false,
      description: 'Full push — send all files, not just changed ones. Required for --delete.',
      required: false,
    }),
    transaction: Flags.boolean({
      allowNo: true,
      default: true,
      description:
        '[CRITICAL] DO NOT run with --no-transaction without explicit user confirmation; this disables rollback. Wraps import in a database transaction (use --no-transaction for debugging purposes).',
      required: false,
    }),
    truncate: Flags.boolean({
      default: false,
      description: '[CRITICAL] STOP and confirm with the user; this truncates live tables before importing.',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  protected override async catch(error: Error & {oclif?: {exit?: number}}): Promise<void> {
    if (error instanceof FailedAfterImportError) return this.catchAfterImport(error)
    return this.catchAsOperational(error)
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Push)
    const {profile, profileName} = this.resolveProfile(flags)

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano workspace push -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    const inputDir = resolve(flags.directory)

    if (!fs.existsSync(inputDir)) {
      this.error(`Directory not found: ${inputDir}`)
    }

    if (!fs.statSync(inputDir).isDirectory()) {
      this.error(`Not a directory: ${inputDir}`)
    }

    const branch = flags.branch || profile.branch || ''
    const baseUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}`
    const json = flags.output === 'json'
    // Only the import writes Version History entries, so only the import carries the message.
    const message = flags.message?.trim()

    const target: PushTarget = {
      buildDryRunUrl: (params) => `${baseUrl}/multidoc/dry-run?${params.toString()}`,
      buildPushUrl(params) {
        const query = new URLSearchParams(params)
        if (message) query.set('message', message)
        return `${baseUrl}/multidoc?${query.toString()}`
      },
      cliVersion: this.config.version,
      explainRefusal: (status, payload) => (status === 403 ? policyFilePushGuidance(payload) : policyCodeGuidance(payload) || undefined),
      instanceOrigin: profile.instance_origin,
      label: `workspace ${workspaceId}`,
      supportsBranches: true,
      supportsPartial: true,
    }

    const pushFlags: PushFlags = {
      delete: flags.delete,
      'dry-run': flags['dry-run'],
      env: flags.env,
      exclude: flags.exclude,
      force: flags.force,
      guids: flags.guids,
      include: flags.include,
      records: flags.records,
      sync: flags.sync,
      transaction: flags.transaction,
      truncate: flags.truncate,
      verbose: flags.verbose,
    }

    const result = await executePush(
      {
        accessToken: profile.access_token,
        branch,
        command: this,
        inputDir,
        knowledge: {
          listUrl: () => `${baseUrl}/knowledge/sync`,
          rootDir: inputDir,
        },
        // Under `-o json` stdout carries one JSON document, so progress goes to stderr.
        log: json ? this.logToStderr.bind(this) : undefined,
        verboseFetch: this.verboseFetch.bind(this),
      },
      target,
      pushFlags,
    )

    if (json) {
      this.log(JSON.stringify(result.stopped
        ? {imported: false, preview: result.preview, reason: result.stopped}
        : importDocument(result), null, 2))
    }

    // Policy feedback describes the multidoc import, so a push that imported none has none.
    if (result.response) this.reportPolicyFeedback(result, json)
  }

  /**
   * A failure after the import landed. The import stands, so its policy feedback is reported as for
   * any push and a blocking finding still exits 2; otherwise the failure exits 1. Under `-o json`
   * stdout holds the import's document with the failure as `error`.
   */
  private catchAfterImport(error: FailedAfterImportError): never {
    const json = this.isJsonOutput()
    const exit = policyExitCode(policyCheck(error.imported)) || 1
    if (json) this.log(JSON.stringify({...importDocument(error.imported), error: {exit, message: error.message}}, null, 2))
    this.reportPolicyFeedback(error.imported, json)
    this.error(error, {exit})
  }

  /** What happened to the policy documents, then the policy check the import answered with. */
  private reportPolicyFeedback(result: PushResult, json: boolean): void {
    const check = policyCheck(result)
    if (!json) {
      const sentPolicies = result.sent.filter((entry) => parseDocument(entry.content)?.type === 'policy').length
      for (const line of policyDocumentSummary(result.preview, sentPolicies)) this.log(line)
      for (const line of policySummary(check, pushEvidence(check))) this.log(line)
    }

    const warning = policyCheckWarning(check)
    if (warning) this.warn(warning)
    const code = policyExitCode(check)
    if (code) {
      process.exitCode = code
      if (!json) this.log('Next: `xano policy status --run-detail` for the current standing, or `xano policy runs` for this run.')
      this.warn('Workspace import completed with blocking policy findings; the imported changes were not rolled back.')
    }
  }
}
