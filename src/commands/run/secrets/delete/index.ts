import {Args, Flags} from '@oclif/core'
import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunSecretsDelete extends BaseRunCommand {
  static args = {
    name: Args.string({
      description: 'Secret name',
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

  static description = 'Delete a secret'

  static examples = [
    `$ xano run secrets delete docker-registry
Are you sure you want to delete secret 'docker-registry'? (y/N)
Secret 'docker-registry' deleted successfully!
`,
    `$ xano run secrets delete docker-registry --force
Secret 'docker-registry' deleted successfully!
`,
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunSecretsDelete)

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
        rl.question(`Are you sure you want to delete secret '${args.name}'? (y/N) `, (answer) => {
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
      const url = this.httpClient.buildProjectUrl('/secret')
      await this.httpClient.delete(url, {name: args.name})

      this.log(`Secret '${args.name}' deleted successfully!`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete secret: ${error.message}`)
      } else {
        this.error(`Failed to delete secret: ${String(error)}`)
      }
    }
  }
}
