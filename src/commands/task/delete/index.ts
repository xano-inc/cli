import {Args, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Task} from '../../../lib/types.js'

export default class TaskDelete extends BaseCommand {
  static override description = 'Delete a scheduled task'

  static override examples = [
    `$ xano task delete 123 -w 40
Are you sure you want to delete task 'daily_cleanup' (ID: 123)? (y/N) y
Task deleted successfully!
`,
    `$ xano task delete 123 -w 40 --force
Task deleted successfully!
`,
  ]

  static override args = {
    task_id: Args.string({
      description: 'Task ID',
      required: true,
    }),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Skip confirmation prompt',
      required: false,
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TaskDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Get task info for confirmation
      const task = await client.getTask(workspaceId, args.task_id) as Task

      if (!flags.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete task '${task.name}' (ID: ${task.id})? This cannot be undone.`,
            default: false,
          },
        ])

        if (!confirm) {
          this.log('Delete cancelled.')
          return
        }
      }

      await client.deleteTask(workspaceId, args.task_id)
      this.log('Task deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
