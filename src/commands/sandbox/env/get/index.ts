import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class SandboxEnvGet extends BaseCommand {
  static description = 'Get a single environment variable for a sandbox environment'
  static examples = [
    `$ xano sandbox env get --name DATABASE_URL
postgres://localhost:5432/mydb
`,
    `$ xano sandbox env get --name DATABASE_URL -o json`,
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
    const {flags} = await this.parse(SandboxEnvGet)
    const {profile} = this.resolveProfile(flags)

    const tenant = await this.getOrCreateSandbox(profile, flags.verbose)
    const tenantName = tenant.name
    const envName = flags.name
    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/tenant/${tenantName}/env/${envName}`

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
        this.log(`Environment variable '${envName}' not found for sandbox environment ${tenantName}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get sandbox environment variable: ${error.message}`)
      } else {
        this.error(`Failed to get sandbox environment variable: ${String(error)}`)
      }
    }
  }
}
