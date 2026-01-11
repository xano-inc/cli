import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Task} from '../../../lib/types.js'

export default class TaskEdit extends BaseCommand {
  static override description = 'Edit an existing scheduled task'

  static override examples = [
    `$ xano task edit 123 -w 40 --name new_name
Task updated successfully!
`,
    `$ xano task edit 123 -w 40 --schedule "0 */2 * * *"
Task updated successfully!
`,
    `$ xano task edit 123 -w 40 -f task.xs
Task updated from XanoScript file
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
    name: Flags.string({
      char: 'n',
      description: 'New task name',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'New task description',
      required: false,
    }),
    schedule: Flags.string({
      char: 's',
      description: 'New cron schedule expression',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to XanoScript file',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TaskEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let task: Task

      if (flags.file) {
        // Update from XanoScript file
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }

        const xsContent = fs.readFileSync(flags.file, 'utf8')
        task = await client.updateTask(workspaceId, args.task_id, xsContent, true) as Task
      } else {
        // Fetch existing task to preserve fields
        const existing = await client.getTask(workspaceId, args.task_id) as Task

        const data: Record<string, unknown> = {
          ...existing,
        }

        if (flags.name !== undefined) {
          data.name = flags.name
        }
        if (flags.description !== undefined) {
          data.description = flags.description
        }
        if (flags.schedule !== undefined) {
          data.schedule = flags.schedule
        }

        task = await client.updateTask(workspaceId, args.task_id, data, false) as Task
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(task, null, 2))
      } else {
        this.log('Task updated successfully!')
        this.log(`ID: ${task.id}`)
        this.log(`Name: ${task.name}`)
        if (task.schedule) {
          this.log(`Schedule: ${task.schedule}`)
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
