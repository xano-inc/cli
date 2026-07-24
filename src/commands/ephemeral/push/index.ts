import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import {resolve} from 'node:path'

import BaseCommand from '../../../base-command.js'
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
  }

}
