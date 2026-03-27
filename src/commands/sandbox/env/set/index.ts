import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class SandboxEnvSet extends BaseCommand {
  static description = 'Set (create or update) an environment variable for a sandbox environment'
  static examples = [
    `$ xano sandbox env set --name DATABASE_URL --value postgres://localhost:5432/mydb
Environment variable 'DATABASE_URL' set
`,
    `$ xano sandbox env set --name DATABASE_URL --value postgres://localhost:5432/mydb -o json`,
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
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxEnvSet)
    const {profile} = this.resolveProfile(flags)

    const envName = flags.name
    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/env/${envName}`

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
        this.log(`Environment variable '${envName}' set for sandbox environment`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to set sandbox environment variable: ${error.message}`)
      } else {
        this.error(`Failed to set sandbox environment variable: ${String(error)}`)
      }
    }
  }
}
