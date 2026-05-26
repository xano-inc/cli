import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class TenantEnvSet extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name',
      required: true,
    }),
  }
  static description = 'Set (create or update) an environment variable for a tenant'
  static examples = [
    `$ xano tenant env set my-tenant --name DATABASE_URL --value postgres://localhost:5432/mydb
Environment variable 'DATABASE_URL' set for tenant my-tenant
`,
    `$ xano tenant env set my-tenant --name DATABASE_URL --value postgres://localhost:5432/mydb -w 5 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({
      char: 'n',
      description: 'Environment variable name',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    value: Flags.string({
      description: 'Environment variable value',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantEnvSet)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const envName = flags.name
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/env/${envName}`

    const body = {
      env: {
        name: envName,
        value: flags.value,
      },
    }

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'PATCH',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      if (flags.output === 'json') {
        const result = await response.json()
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(`Environment variable '${envName}' set for tenant ${tenantName}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to set tenant environment variable: ${error.message}`)
      } else {
        this.error(`Failed to set tenant environment variable: ${String(error)}`)
      }
    }
  }

}
