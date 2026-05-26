import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface BackupResult {
  id: number
}

export default class TenantBackupCreate extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to back up',
      required: true,
    }),
  }
  static description = 'Create a backup for a tenant'
  static examples = [
    `$ xano tenant backup create t1234-abcd-xyz1 --description "Pre-deploy backup"
Created backup #15 for tenant t1234-abcd-xyz1
`,
    `$ xano tenant backup create t1234-abcd-xyz1 -d "Daily backup" -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      default: '',
      description: 'Backup description',
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
    const {args, flags} = await this.parse(TenantBackupCreate)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const tenantName = args.tenant_name

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/backup`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({description: flags.description}),
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
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const result = await response.json() as BackupResult

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(`Created backup #${result.id} for tenant ${tenantName}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create backup: ${error.message}`)
      } else {
        this.error(`Failed to create backup: ${String(error)}`)
      }
    }
  }

}
