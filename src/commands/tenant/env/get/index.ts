import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class TenantEnvGet extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name',
      required: true,
    }),
  }
  static description = 'Get a single environment variable for a tenant'
  static examples = [
    `$ xano tenant env get my-tenant --name DATABASE_URL
postgres://localhost:5432/mydb
`,
    `$ xano tenant env get my-tenant --name DATABASE_URL -w 5 -o json`,
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantEnvGet)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const envName = flags.name
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/env/${envName}`

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

      const envVar = (await response.json()) as {name: string; value: string} | null

      if (flags.output === 'json') {
        this.log(JSON.stringify(envVar, null, 2))
      } else if (envVar) {
        this.log(envVar.value)
      } else {
        this.log(`Environment variable '${envName}' not found for tenant ${tenantName}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get tenant environment variable: ${error.message}`)
      } else {
        this.error(`Failed to get tenant environment variable: ${String(error)}`)
      }
    }
  }

}
