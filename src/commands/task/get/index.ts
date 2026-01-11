import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Task} from '../../../lib/types.js'

export default class TaskGet extends BaseCommand {
  static override description = 'Get details of a specific scheduled task'

  static override examples = [
    `$ xano task get 123 -w 40
Task: daily_cleanup
ID: 123
Schedule: 0 0 * * *
Description: Runs daily cleanup job
`,
    `$ xano task get 123 -w 40 -o json
{
  "id": 123,
  "name": "daily_cleanup",
  "schedule": "0 0 * * *"
}
`,
    `$ xano task get 123 -w 40 -o xs
task daily_cleanup {
  ...
}
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json', 'xs'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TaskGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const includeXanoscript = flags.output === 'xs'
      const task = await client.getTask(workspaceId, args.task_id, includeXanoscript) as Task

      if (flags.output === 'json') {
        this.log(JSON.stringify(task, null, 2))
      } else if (flags.output === 'xs') {
        if (task.xanoscript && task.xanoscript.status === 'ok' && task.xanoscript.value) {
          this.log(task.xanoscript.value)
        } else {
          this.error('XanoScript not available for this task')
        }
      } else {
        this.log(`Task: ${task.name}`)
        this.log(`ID: ${task.id}`)
        if (task.schedule) {
          this.log(`Schedule: ${task.schedule}`)
        }
        if (task.description) {
          this.log(`Description: ${task.description}`)
        }
        if (task.guid) {
          this.log(`GUID: ${task.guid}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
