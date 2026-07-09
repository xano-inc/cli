import {Args, Flags} from '@oclif/core'
import * as readline from 'node:readline'

import BaseCommand from '../../../../base-command.js'

export default class TenantSnapshotDelete extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name that owns the snapshot',
      required: true,
    }),
  }
  static description =
    '[CRITICAL] NEVER delete a snapshot without explicit user confirmation; this permanently drops the snapshot database. The live and original databases cannot be deleted.'
  static examples = [
    `$ xano tenant snapshot delete t1234-abcd-xyz1 --snapshot t1234-abcd-xyz1_bk_20260603_203614
Are you sure you want to delete snapshot "t1234-abcd-xyz1_bk_20260603_203614"? This action cannot be undone. (y/N) y
Deleted snapshot t1234-abcd-xyz1_bk_20260603_203614
`,
    `$ xano tenant snapshot delete t1234-abcd-xyz1 --snapshot t1234-abcd-xyz1_bk_20260603_203614 --force`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: '[CRITICAL] Skips the confirmation prompt.',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    snapshot: Flags.string({
      description: 'Snapshot database name to delete',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantSnapshotDelete)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const {snapshot} = flags

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to delete snapshot "${snapshot}"? This action cannot be undone.`,
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    const queryParams = new URLSearchParams({snapshot})
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/snapshot?${queryParams.toString()}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
          },
          method: 'DELETE',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify({deleted: true, snapshot, tenant_name: tenantName}, null, 2))
      } else {
        this.log(`Deleted snapshot ${snapshot}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete snapshot: ${error.message}`)
      } else {
        this.error(`Failed to delete snapshot: ${String(error)}`)
      }
    }
  }

  private async confirm(message: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(`${message} (y/N) `, (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      })
    })
  }
}
