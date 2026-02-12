import {Args, Flags} from '@oclif/core'

import type {EnvValueResponse} from '../../../../lib/run-types.js'

import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunEnvGet extends BaseRunCommand {
  static args = {
    name: Args.string({
      description: 'Environment variable name',
      required: true,
    }),
  }
static description = 'Get an environment variable value'
static examples = [
    `$ xano run env get API_KEY
my-secret-api-key
`,
    `$ xano run env get API_KEY -o json
{ "name": "API_KEY", "value": "my-secret-api-key" }
`,
  ]
static override flags = {
    ...BaseRunCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      default: 'value',
      description: 'Output format',
      options: ['value', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunEnvGet)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile, flags.verbose)

    try {
      const url = this.httpClient.buildProjectUrl('/env', {name: args.name})
      const result = await this.httpClient.get<EnvValueResponse>(url)

      if (flags.output === 'json') {
        this.outputJson(result)
      } else {
        this.log(result.value)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get environment variable: ${error.message}`)
      } else {
        this.error(`Failed to get environment variable: ${String(error)}`)
      }
    }
  }
}
