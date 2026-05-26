import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface Backup {
  _release?: {name?: string}
  _user?: {email?: string; name?: string}
  created_at?: string
  description?: string
  id: number
}

export default class TenantBackupList extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to list backups for',
      required: true,
    }),
  }
  static description = 'List backups for a tenant'
  static examples = [
    `$ xano tenant backup list t1234-abcd-xyz1
Backups for tenant t1234-abcd-xyz1:
  - #1 - Pre-deploy backup (2024-01-15)
  - #2 - Daily backup (2024-01-16)
`,
    `$ xano tenant backup list t1234-abcd-xyz1 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    page: Flags.integer({
      default: 1,
      description: 'Page number for pagination',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantBackupList)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const tenantName = args.tenant_name
    const queryParams = new URLSearchParams({page: flags.page.toString()})
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/backup?${queryParams.toString()}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const data = await response.json() as Backup[] | {items?: Backup[]}

      let backups: Backup[]
      if (Array.isArray(data)) {
        backups = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        backups = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(backups, null, 2))
      } else {
        if (backups.length === 0) {
          this.log(`No backups found for tenant ${tenantName}`)
        } else {
          this.log(`Backups for tenant ${tenantName}:`)
          for (const backup of backups) {
            let date = 'unknown'
            if (backup.created_at) {
              const d = new Date(backup.created_at)
              date = Number.isNaN(d.getTime()) ? backup.created_at : d.toISOString().split('T')[0]
            }
            const desc = backup.description || 'No description'
            this.log(`  - #${backup.id} - ${desc} (${date})`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list backups: ${error.message}`)
      } else {
        this.error(`Failed to list backups: ${String(error)}`)
      }
    }
  }

}
