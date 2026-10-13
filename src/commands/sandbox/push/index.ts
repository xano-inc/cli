import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import {basename, dirname, relative, resolve} from 'node:path'
import open from 'open'

import BaseCommand from '../../../base-command.js'
import {formatWorkspacePushDefaultsBanner, resolvePushDefaults} from '../../../utils/local-config.js'
import {executePush, type PushFlags, type PushTarget} from '../../../utils/multidoc-push.js'
import {policiesSkippedNotice} from '../../../utils/policy/feedback.js'

export default class SandboxPush extends BaseCommand {
  static override description =
    '[IMPORTANT] ALWAYS run --dry-run first and show the user the output before pushing. Push local documents to your sandbox environment via multidoc import. By default, only changed files are pushed (partial mode). Use --sync to push all files. Shows a preview of changes before pushing unless --force is specified. Use --dry-run to preview only. Include/exclude glob filters are intentionally not supported on sandbox push — partial pushes can hide deletions during review and lead to data loss when promoted to the workspace. Pushing into a sandbox that currently holds a different workspace will prompt for confirmation; run `xano sandbox reset` first to start clean.'
  static override examples = [
    `$ xano sandbox push
Push from current directory (default partial mode)
`,
    `$ xano sandbox push -d ./my-workspace
Push from a specific directory
`,
    `$ xano sandbox push --sync
Push all files to the sandbox
`,
    `$ xano sandbox push --sync --delete
Push all files and delete remote objects not included
`,
    `$ xano sandbox push --dry-run
Preview changes without pushing
`,
    `$ xano sandbox push --force
Skip preview and push immediately
`,
    `$ xano sandbox push --fast
Push only files that changed since the last sync, and write .xano/sync_state.json
`,
    `$ xano sandbox push --fast --refresh
Re-compare local files against the sandbox export, then push changes
`,
    `$ xano sandbox push --no-fast
Push without --fast even when profile.yaml sets fast: true
`,
    `$ xano sandbox push --writeback
Push and write server-formatted XanoScript back to local files
`,
    `$ xano sandbox push --records --env`,
    `$ xano sandbox push --truncate`,
    `$ xano sandbox push --review
Push and open sandbox review in the browser
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    delete: Flags.boolean({
      default: false,
      description: 'Delete sandbox objects not included in the push (requires --sync)',
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
    fast: Flags.boolean({
      allowNo: true,
      description:
        'Skip files whose contents match .xano/sync_state.json, and write or update that record. Without a record, compares against the sandbox export once. Can be set as `fast: true` in profile.yaml.',
      required: false,
    }),
    force: Flags.boolean({
      default: false,
      description: 'Skip preview and confirmation prompt (for CI/CD pipelines)',
      required: false,
    }),
    guids: Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Write server-assigned GUIDs back to local files (use --no-guids to skip)',
      required: false,
    }),
    records: Flags.boolean({
      default: false,
      description: 'Include records in import',
      required: false,
    }),
    refresh: Flags.boolean({
      default: false,
      description: 'With --fast, re-compare local files against the sandbox export even when a sync record exists',
      required: false,
    }),
    review: Flags.boolean({
      default: false,
      description: 'Open sandbox review in the browser after pushing',
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
    writeback: Flags.boolean({
      allowNo: true,
      description:
        'After a successful push, write server-formatted XanoScript back to the files that were pushed. Can be set as `writeback: true` in profile.yaml.',
      required: false,
    }),
    'writeback-diff': Flags.string({
      description: 'With --writeback, save local vs server copies of rewritten files under this directory',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxPush)
    const {profile} = this.resolveProfile(flags)

    const inputDir = resolve(flags.directory)

    if (!fs.existsSync(inputDir)) {
      this.error(`Directory not found: ${inputDir}`)
    }

    if (!fs.statSync(inputDir).isDirectory()) {
      this.error(`Not a directory: ${inputDir}`)
    }

    const baseUrl = `${profile.instance_origin}/api:meta/sandbox`
    const pushDefaults = resolvePushDefaults({
      flagFast: flags.fast,
      flagWriteback: flags.writeback,
      localFast: this.localProfile?.config.fast,
      localWriteback: this.localProfile?.config.writeback,
      sync: flags.sync,
    })
    if (pushDefaults.fromLocal.length > 0 && this.localProfile) {
      const relativePath = relative(process.cwd(), this.localProfile.path) || basename(this.localProfile.path)
      this.log(formatWorkspacePushDefaultsBanner(pushDefaults.fromLocal, relativePath))
    }

    const target: PushTarget = {
      buildDryRunUrl: (params) => `${baseUrl}/multidoc/dry-run?${params.toString()}`,
      buildPushUrl: (params) => `${baseUrl}/multidoc?${params.toString()}`,
      cliVersion: this.config.version,
      instanceOrigin: profile.instance_origin,
      label: 'sandbox environment',
      sourceWorkspaceId: profile.workspace,
      supportsBranches: false,
      supportsPartial: true,
      warnOnWorkspaceMismatch: true,
    }

    const pushFlags: PushFlags = {
      delete: flags.delete,
      'dry-run': flags['dry-run'],
      env: flags.env,
      fast: pushDefaults.fast,
      force: flags.force,
      guids: flags.guids,
      records: flags.records,
      refresh: flags.refresh,
      sync: flags.sync,
      transaction: flags.transaction,
      truncate: flags.truncate,
      verbose: flags.verbose,
      writeback: pushDefaults.writeback,
      writebackDiff: flags['writeback-diff'],
    }

    const result = await executePush(
      {
        accessToken: profile.access_token,
        branch: '',
        command: this,
        inputDir,
        knowledge: {
          listUrl: () => `${baseUrl}/knowledge/sync`,
          rootDir: inputDir,
        },
        syncTarget: {
          instanceOrigin: profile.instance_origin,
          kind: 'sandbox',
          markerDir: dirname(this.getCredentialsPath()),
        },
        verboseFetch: this.verboseFetch.bind(this),
      },
      target,
      pushFlags,
    )
    // When the platform leaves policy files out, it says so once.
    const skipped = policiesSkippedNotice(result.response ?? result.preview)
    if (skipped) this.warn(skipped)

    if (flags.review) {
      await this.openReview(profile.instance_origin, profile.access_token, flags.verbose)
    }
  }

  private getFrontendUrl(instanceOrigin: string): string {
    try {
      const url = new URL(instanceOrigin)
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        url.port = '4200'
        return url.origin
      }
    } catch {
      // fall through
    }

    return instanceOrigin
  }

  private async openReview(instanceOrigin: string, accessToken: string, verbose: boolean): Promise<void> {
    const response = await this.verboseFetch(
      `${instanceOrigin}/api:meta/sandbox/impersonate`,
      {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        method: 'GET',
      },
      verbose,
      accessToken,
    )

    if (!response.ok) {
      const message = await this.parseApiError(response, 'Failed to open sandbox review')
      this.error(message)
    }

    const result = (await response.json()) as {_ti: string}

    if (!result._ti) {
      this.error('No one-time token returned from impersonate API')
    }

    const frontendUrl = this.getFrontendUrl(instanceOrigin)
    const params = new URLSearchParams({_ti: result._ti})
    const reviewUrl = `${frontendUrl}/impersonate?${params.toString()}`

    this.log('Opening sandbox review...')
    await open(reviewUrl)
  }

}
