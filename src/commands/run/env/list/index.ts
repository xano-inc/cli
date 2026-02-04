import {Flags} from '@oclif/core'
import BaseRunCommand from '../../../../lib/base-run-command.js'
import type {EnvKeysResponse} from '../../../../lib/run-types.js'

export default class RunEnvList extends BaseRunCommand {
  static args = {}

  static override flags = {
    ...BaseRunCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'list',
      options: ['list', 'json'],
    }),
  }

  static description = 'List all environment variable keys'

  static examples = [
    `$ xano run env list
Environment variables:
  - API_KEY
  - DATABASE_URL
  - DEBUG
`,
    `$ xano run env list -o json
{ "env": ["API_KEY", "DATABASE_URL", "DEBUG"] }
`,
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(RunEnvList)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile)

    try {
      const url = this.httpClient.buildProjectUrl('/env/key')
      const result = await this.httpClient.get<EnvKeysResponse>(url)

      if (flags.output === 'json') {
        this.outputJson(result)
      } else {
        if (result.env.length === 0) {
          this.log('No environment variables found.')
        } else {
          this.log('Environment variables:')
          for (const key of result.env) {
            this.log(`  - ${key}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list environment variables: ${error.message}`)
      } else {
        this.error(`Failed to list environment variables: ${String(error)}`)
      }
    }
  }
}
