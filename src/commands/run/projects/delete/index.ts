import {Args, Flags} from '@oclif/core'

import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunProjectsDelete extends BaseRunCommand {
  static args = {
    projectId: Args.string({
      description: 'Project ID to delete',
      required: true,
    }),
  }
static description = 'Delete a project'
static examples = [
    `$ xano run projects delete abc123-def456
Are you sure you want to delete project 'abc123-def456'? (y/N)
Project deleted successfully!
`,
    `$ xano run projects delete abc123-def456 --force
Project deleted successfully!
`,
  ]
static override flags = {
    ...BaseRunCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skip confirmation prompt',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunProjectsDelete)

    // Initialize (no project required)
    await this.initRunCommand(flags.profile, flags.verbose)

    // Confirm deletion unless --force is used
    if (!flags.force) {
      const readline = await import('node:readline')
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const confirmed = await new Promise<boolean>((resolve) => {
        rl.question(`Are you sure you want to delete project '${args.projectId}'? (y/N) `, (answer) => {
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
      const url = this.httpClient.buildUrl(`/project/${args.projectId}`)
      await this.httpClient.delete(url)

      this.log('Project deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete project: ${error.message}`)
      } else {
        this.error(`Failed to delete project: ${String(error)}`)
      }
    }
  }
}
