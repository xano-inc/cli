import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class TenantEnvList extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name',
      required: true,
    }),
  }
  static description = 'List environment variable keys for a tenant'
  static examples = [
    `$ xano tenant env list my-tenant
Environment variables for tenant my-tenant:
  - DATABASE_URL
  - API_KEY
  - SECRET_TOKEN
`,
    `$ xano tenant env list my-tenant -w 5 -o json`,
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantEnvList)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/env_key`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
          },
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const data = (await response.json()) as {env: Array<{name: string; value: string}>}

      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
      } else {
        const envVars = data.env || []
        if (envVars.length === 0) {
          this.log(`No environment variables found for tenant ${tenantName}`)
        } else {
          this.log(`Environment variables for tenant ${tenantName}:`)
          for (const envVar of envVars) {
            this.log(`  - ${envVar.name}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list tenant environment variables: ${error.message}`)
      } else {
        this.error(`Failed to list tenant environment variables: ${String(error)}`)
      }
    }
  }

}
