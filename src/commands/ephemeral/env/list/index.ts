import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class EphemeralEnvList extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name',
      required: true,
    }),
  }
  static description = 'List environment variable keys for an ephemeral tenant'
  static examples = [
    `$ xano ephemeral env list my-tenant
Environment variables for ephemeral tenant my-tenant:
  - DATABASE_URL
  - API_KEY
`,
    `$ xano ephemeral env list my-tenant -o json`,
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
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralEnvList)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\n` + `Create a profile using 'xano profile create'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const tenantName = args.tenant_name
    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${tenantName}/env_key`

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
          this.log(`No environment variables found for ephemeral tenant ${tenantName}`)
        } else {
          this.log(`Environment variables for ephemeral tenant ${tenantName}:`)
          for (const envVar of envVars) {
            this.log(`  - ${envVar.name}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list ephemeral tenant environment variables: ${error.message}`)
      } else {
        this.error(`Failed to list ephemeral tenant environment variables: ${String(error)}`)
      }
    }
  }
}
