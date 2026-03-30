import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class SandboxEnvList extends BaseCommand {
  static description = 'List environment variable keys for a sandbox environment'
  static examples = [
    `$ xano sandbox env list
Environment variables for sandbox environment:
  - DATABASE_URL
  - API_KEY
`,
    `$ xano sandbox env list -o json`,
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
    const {flags} = await this.parse(SandboxEnvList)
    const {profile} = this.resolveProfile(flags)

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/env_key`

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
        const message = await this.parseApiError(response, 'API request failed')
        this.error(message)
      }

      const data = (await response.json()) as {env: Array<{name: string; value: string}>}

      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
      } else {
        const envVars = data.env || []
        if (envVars.length === 0) {
          this.log(`No environment variables found for sandbox environment`)
        } else {
          this.log(`Environment variables for sandbox environment:`)
          for (const envVar of envVars) {
            this.log(`  - ${envVar.name}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list sandbox environment variables: ${error.message}`)
      } else {
        this.error(`Failed to list sandbox environment variables: ${String(error)}`)
      }
    }
  }
}
