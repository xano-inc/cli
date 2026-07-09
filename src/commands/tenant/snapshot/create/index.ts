import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface SnapshotResult {
  backup: string
  description?: string
  size?: string
  source?: string
}

export default class TenantSnapshotCreate extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to snapshot',
      required: true,
    }),
  }
  static description = "Create a database snapshot for a tenant (an instant clone of the tenant's database)"
  static examples = [
    `$ xano tenant snapshot create t1234-abcd-xyz1 --label before-v2
Created snapshot t1234-abcd-xyz1_bk_20260603_203614 for tenant t1234-abcd-xyz1
`,
    `$ xano tenant snapshot create t1234-abcd-xyz1 -l before-v2 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    label: Flags.string({
      char: 'l',
      default: '',
      description: 'Optional label appended to the snapshot description (alphanumeric)',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantSnapshotCreate)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/snapshot`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({label: flags.label}),
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

      const result = (await response.json()) as SnapshotResult

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(`Created snapshot ${result.backup} for tenant ${tenantName}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create snapshot: ${error.message}`)
      } else {
        this.error(`Failed to create snapshot: ${String(error)}`)
      }
    }
  }
}
