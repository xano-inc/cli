import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import {resolve} from 'node:path'

import BaseCommand from '../../../base-command.js'
import {executePush, type PushFlags, type PushTarget} from '../../../utils/multidoc-push.js'

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
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch name (optional if set in profile, defaults to live)',
      required: false,
    }),
    directory: Flags.string({
      char: 'd',
      default: '.',
      description: 'Directory containing documents to push (defaults to current directory)',
      required: false,
    }),
    delete: Flags.boolean({
      default: false,
      description:
        '[CRITICAL] STOP and confirm with the user before running. Delete workspace objects not included in the push (requires --sync).',
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
    records: Flags.boolean({
      default: false,
      description:
        '[CRITICAL] ALWAYS show the user a preview before pushing live data. Includes table records in import.',
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
        'Wrap import in a database transaction (use --no-transaction for debugging purposes). [CRITICAL] DO NOT run with --no-transaction without explicit user confirmation; this disables rollback.',
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

    const target: PushTarget = {
      buildDryRunUrl: (params) => `${baseUrl}/multidoc/dry-run?${params.toString()}`,
      buildPushUrl: (params) => `${baseUrl}/multidoc?${params.toString()}`,
      cliVersion: this.config.version,
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

    await executePush(
      {
        accessToken: profile.access_token,
        branch,
        command: this,
        inputDir,
        verboseFetch: this.verboseFetch.bind(this),
      },
      target,
      pushFlags,
    )
  }
}
