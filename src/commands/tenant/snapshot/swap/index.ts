import {Args, Flags} from '@oclif/core'
import * as readline from 'node:readline'

import BaseCommand from '../../../../base-command.js'

interface SwapResult {
  from?: string
  tenant?: string
  to?: string
}

export default class TenantSnapshotSwap extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to swap',
      required: true,
    }),
  }
  static description =
    "Swap a tenant's live database to a snapshot. This repoints the tenant; the current live database is left untouched, so you can swap back. To roll back, swap to the original database name."
  static examples = [
    `$ xano tenant snapshot swap t1234-abcd-xyz1 --snapshot t1234-abcd-xyz1_bk_20260603_203614
Swapped tenant t1234-abcd-xyz1 from t1234-abcd-xyz1 to t1234-abcd-xyz1_bk_20260603_203614
`,
    `$ xano tenant snapshot swap t1234-abcd-xyz1 --snapshot t1234-abcd-xyz1 --force`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skips the confirmation prompt.',
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
      description: 'Snapshot database name to swap to (use the original tenant name to roll back)',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantSnapshotSwap)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const {snapshot} = flags

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Swap tenant ${tenantName} to "${snapshot}"? This repoints the tenant's live database.`,
      )
      if (!confirmed) {
        this.log('Swap cancelled.')
        return
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/snapshot/swap`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({snapshot}),
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const result = (await response.json()) as SwapResult

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(`Swapped tenant ${tenantName} from ${result.from ?? 'unknown'} to ${result.to ?? snapshot}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to swap snapshot: ${error.message}`)
      } else {
        this.error(`Failed to swap snapshot: ${String(error)}`)
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
