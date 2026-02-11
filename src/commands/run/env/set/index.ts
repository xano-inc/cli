import {Args} from '@oclif/core'

import type {UpdateEnvInput} from '../../../../lib/run-types.js'

import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunEnvSet extends BaseRunCommand {
  static args = {
    name: Args.string({
      description: 'Environment variable name',
      required: true,
    }),
    value: Args.string({
      description: 'Environment variable value',
      required: true,
    }),
  }
static description = 'Set an environment variable'
static examples = [
    `$ xano run env set API_KEY my-secret-key
Environment variable 'API_KEY' set successfully!
`,
    `$ xano run env set DATABASE_URL "postgres://user:pass@host/db"
Environment variable 'DATABASE_URL' set successfully!
`,
  ]
static override flags = {
    ...BaseRunCommand.baseFlags,
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunEnvSet)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile, flags.verbose)

    const input: UpdateEnvInput = {
      env: {
        name: args.name,
        value: args.value,
      },
      name: args.name,
    }

    try {
      const url = this.httpClient.buildProjectUrl('/env')
      await this.httpClient.patch(url, input)

      this.log(`Environment variable '${args.name}' set successfully!`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to set environment variable: ${error.message}`)
      } else {
        this.error(`Failed to set environment variable: ${String(error)}`)
      }
    }
  }
}
