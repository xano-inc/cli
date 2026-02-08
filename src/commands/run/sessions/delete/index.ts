import {Args, Flags} from '@oclif/core'
import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunSessionsDelete extends BaseRunCommand {
  static args = {
    sessionId: Args.string({
      description: 'Session ID',
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

  static description = 'Delete a session'

  static examples = [
    `$ xano run sessions delete abc123-def456
Are you sure you want to delete session 'abc123-def456'? (y/N)
Session deleted successfully!
`,
    `$ xano run sessions delete abc123-def456 --force
Session deleted successfully!
`,
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunSessionsDelete)

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
        rl.question(`Are you sure you want to delete session '${args.sessionId}'? (y/N) `, (answer) => {
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
      const url = this.httpClient.buildProjectUrl(`/run/session/${args.sessionId}`)
      await this.httpClient.delete(url)

      this.log('Session deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete session: ${error.message}`)
      } else {
        this.error(`Failed to delete session: ${String(error)}`)
      }
    }
  }
}
