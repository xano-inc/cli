import {Args, Flags} from '@oclif/core'
import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunEnvDelete extends BaseRunCommand {
  static args = {
    name: Args.string({
      description: 'Environment variable name',
      required: true,
    }),
  }

  static override flags = {
    ...BaseRunCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      description: 'Skip confirmation prompt',
      required: false,
      default: false,
    }),
  }

  static description = 'Delete an environment variable'

  static examples = [
    `$ xano run env delete API_KEY
Are you sure you want to delete environment variable 'API_KEY'? (y/N)
Environment variable 'API_KEY' deleted successfully!
`,
    `$ xano run env delete API_KEY --force
Environment variable 'API_KEY' deleted successfully!
`,
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunEnvDelete)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile, flags.verbose)

    // Confirm deletion unless --force is used
    if (!flags.force) {
      const readline = await import('node:readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const confirmed = await new Promise<boolean>((resolve) => {
        rl.question(`Are you sure you want to delete environment variable '${args.name}'? (y/N) `, (answer) => {
          rl.close()
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
        })
      })

      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    try {
      const url = this.httpClient.buildProjectUrl('/env')
      await this.httpClient.delete(url, {name: args.name})

      this.log(`Environment variable '${args.name}' deleted successfully!`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete environment variable: ${error.message}`)
      } else {
        this.error(`Failed to delete environment variable: ${String(error)}`)
      }
    }
  }
}
