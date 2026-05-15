import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import {resolve} from 'node:path'
import open from 'open'

import BaseCommand from '../../../base-command.js'
import {executePush, type PushFlags, type PushTarget} from '../../../utils/multidoc-push.js'

export default class SandboxPush extends BaseCommand {
  static override description =
    '[IMPORTANT] ALWAYS run --dry-run first and show the user the output before pushing. Push local documents to your sandbox environment via multidoc import. By default, only changed files are pushed (partial mode). Use --sync to push all files. Shows a preview of changes before pushing unless --force is specified. Use --dry-run to preview only. Include/exclude glob filters are intentionally not supported on sandbox push — partial pushes can hide deletions during review and lead to data loss when promoted to the workspace. Large pushes against a sandbox loaded with a different workspace will prompt for confirmation; run `xano sandbox reset` first to start clean.'
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
    `$ xano sandbox push --records --env`,
    `$ xano sandbox push --truncate`,
    `$ xano sandbox push --review
Push and open sandbox review in the browser
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    directory: Flags.string({
      char: 'd',
      default: '.',
      description: 'Directory containing documents to push (defaults to current directory)',
      required: false,
    }),
    delete: Flags.boolean({
      default: false,
      description: 'Delete sandbox objects not included in the push (requires --sync)',
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
        'Wrap import in a database transaction (use --no-transaction for debugging purposes). [CRITICAL] DO NOT run with --no-transaction without explicit user confirmation; this disables rollback.',
      required: false,
    }),
    truncate: Flags.boolean({
      default: false,
      description: '[CRITICAL] STOP and confirm with the user; this truncates live tables before importing.',
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

    const target: PushTarget = {
      buildDryRunUrl: (params) => `${baseUrl}/multidoc/dry-run?${params.toString()}`,
      buildPushUrl: (params) => `${baseUrl}/multidoc?${params.toString()}`,
      cliVersion: this.config.version,
      instanceOrigin: profile.instance_origin,
      label: 'sandbox environment',
      supportsBranches: false,
      supportsPartial: true,
      warnOnWorkspaceMismatch: true,
    }

    const pushFlags: PushFlags = {
      delete: flags.delete,
      'dry-run': flags['dry-run'],
      env: flags.env,
      force: flags.force,
      guids: flags.guids,
      records: flags.records,
      sync: flags.sync,
      transaction: flags.transaction,
      truncate: flags.truncate,
      verbose: flags.verbose,
    }

    await executePush(
      {
        accessToken: profile.access_token,
        branch: '',
        command: this,
        inputDir,
        verboseFetch: this.verboseFetch.bind(this),
      },
      target,
      pushFlags,
    )

    if (flags.review) {
      await this.openReview(profile.instance_origin, profile.access_token, flags.verbose)
    }
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
}
