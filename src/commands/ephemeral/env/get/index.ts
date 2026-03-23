import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class EphemeralEnvGet extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name',
      required: true,
    }),
  }
  static description = 'Get a single environment variable for an ephemeral tenant'
  static examples = [
    `$ xano ephemeral env get my-tenant --name DATABASE_URL
postgres://localhost:5432/mydb
`,
    `$ xano ephemeral env get my-tenant --name DATABASE_URL -o json`,
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
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralEnvGet)

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
    const envName = flags.name
    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${tenantName}/env/${envName}`

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
        this.log(`Environment variable '${envName}' not found for ephemeral tenant ${tenantName}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get ephemeral tenant environment variable: ${error.message}`)
      } else {
        this.error(`Failed to get ephemeral tenant environment variable: ${String(error)}`)
      }
    }
  }
}
