import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import {resolve} from 'node:path'

import BaseCommand from '../../../base-command.js'
import {
  isAwaited,
  type MicroserviceStatusEntry,
  waitForMicroservices,
} from '../../../utils/microservice-wait.js'
import {executePush, type PushFlags, type PushTarget} from '../../../utils/multidoc-push.js'

export default class EphemeralPush extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name to push to',
      required: true,
    }),
  }
  static override description =
    '[IMPORTANT] ALWAYS run --dry-run first and show the user the output before pushing. Push local documents to an ephemeral tenant via multidoc import. By default, only changed files are pushed (partial mode). Use --sync to push all files. Shows a preview of changes before pushing unless --force is specified. Use --dry-run to preview only.'
  static override examples = [
    `$ xano ephemeral push e4f2-9ab1-xyz1
Push from current directory (default partial mode)
`,
    `$ xano ephemeral push e4f2-9ab1-xyz1 -d ./my-workspace
Push from a specific directory
`,
    `$ xano ephemeral push e4f2-9ab1-xyz1 --sync
Push all files to the ephemeral tenant
`,
    `$ xano ephemeral push e4f2-9ab1-xyz1 --sync --delete
Push all files and delete remote objects not included
`,
    `$ xano ephemeral push e4f2-9ab1-xyz1 --dry-run
Preview changes without pushing
`,
    `$ xano ephemeral push e4f2-9ab1-xyz1 --force
Skip preview and push immediately
`,
    `$ xano ephemeral push e4f2-9ab1-xyz1 --records --env`,
    `$ xano ephemeral push e4f2-9ab1-xyz1 --truncate`,
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
      description: 'Delete remote objects not included in the push (requires --sync)',
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
    wait: Flags.boolean({
      default: false,
      description:
        'After pushing, wait for auto-deployed microservices (tenant_deploy="auto") to become ready. Exits non-zero if any fails to deploy or the wait times out. Ignored with --dry-run.',
      required: false,
    }),
    'wait-timeout': Flags.integer({
      default: 300,
      description: 'Seconds to wait for microservices to become ready when --wait is set (default 300).',
      min: 1,
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralPush)
    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Ephemeral tenants require a workspace — use --workspace or set one in your profile.')
    }

    const inputDir = resolve(flags.directory)

    if (!fs.existsSync(inputDir)) {
      this.error(`Directory not found: ${inputDir}`)
    }

    if (!fs.statSync(inputDir).isDirectory()) {
      this.error(`Not a directory: ${inputDir}`)
    }

    const tenantName = args.tenant_name
    const baseUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}`

    const target: PushTarget = {
      buildDryRunUrl: (params) => `${baseUrl}/multidoc/dry-run?${params.toString()}`,
      buildPushUrl: (params) => `${baseUrl}/multidoc?${params.toString()}`,
      cliVersion: this.config.version,
      instanceOrigin: profile.instance_origin,
      label: `ephemeral tenant ${tenantName}`,
      sourceWorkspaceId: profile.workspace,
      supportsBranches: false,
      supportsPartial: true,
      warnOnWorkspaceMismatch: false,
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

    // --wait: after a real push, poll the tenant's live microservice status until
    // every auto-deployed microservice (tenant_deploy="auto") is ready or the
    // wait times out. Skipped on --dry-run (nothing was deployed).
    if (flags.wait && !flags['dry-run']) {
      await this.waitForDeploy(baseUrl, profile.access_token, tenantName, flags['wait-timeout'], flags.verbose)
    }
  }

  /**
   * Poll GET .../tenant/{name}/microservice until auto microservices settle.
   * Renders a one-line-per-microservice progress view that updates in place, then
   * exits non-zero if any auto microservice failed or the wait timed out.
   */
  private async waitForDeploy(
    baseUrl: string,
    accessToken: string,
    tenantName: string,
    timeoutSeconds: number,
    verbose: boolean,
  ): Promise<void> {
    this.log('')
    this.log(`Waiting for microservices to deploy (timeout ${timeoutSeconds}s)…`)

    const icon = (e: MicroserviceStatusEntry): string => {
      if (!isAwaited(e)) return '➖'
      switch (e.status) {
        case 'error': {
          return '❌'
        }

        case 'ok': {
          return '✅'
        }

        default: {
          return '⏳'
        }
      }
    }

    const line = (e: MicroserviceStatusEntry): string => {
      const detail = isAwaited(e) ? e.detail || e.status : `skipped (${e.tenant_deploy ?? 'manual'})`
      return `  ${icon(e)} ${e.name.padEnd(24)} ${detail}`
    }

    const result = await waitForMicroservices({
      accessToken,
      onPoll: (entries) => {
        // Re-render the block: move the cursor up over the previous render (if any)
        // and rewrite. Falls back to plain appends when not a TTY.
        if (process.stdout.isTTY && this.lastRenderLines > 0) {
          process.stdout.write(`[${this.lastRenderLines}A[0J`)
        }

        const lines = entries.map((e) => line(e))
        for (const l of lines) this.log(l)
        this.lastRenderLines = process.stdout.isTTY ? lines.length : 0
      },
      statusUrl: `${baseUrl}/microservice`,
      timeoutMs: timeoutSeconds * 1000,
      verbose,
      verboseFetch: this.verboseFetch.bind(this),
    })

    const awaited = result.entries.filter((e) => isAwaited(e))
    const ready = awaited.filter((e) => e.status === 'ok').length

    if (result.timedOut) {
      this.error(
        `Timed out after ${timeoutSeconds}s waiting for microservices (${ready}/${awaited.length} ready). ` +
          `Check status with the Xano dashboard or re-run with a larger --wait-timeout.`,
      )
    }

    if (result.hadError) {
      const failed = awaited.filter((e) => e.status === 'error').map((e) => `${e.name} (${e.detail || 'error'})`)
      this.error(`Microservice deploy failed: ${failed.join(', ')}`)
    }

    this.log(`All microservices ready (${ready}/${awaited.length}).`)
  }

  /** Number of lines the last progress render wrote (for in-place TTY updates). */
  private lastRenderLines = 0

}
