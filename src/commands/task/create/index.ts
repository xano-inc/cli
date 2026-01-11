import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Task} from '../../../lib/types.js'

export default class TaskCreate extends BaseCommand {
  static override description = 'Create a new scheduled task'

  static override examples = [
    `$ xano task create -w 40 --name daily_cleanup --schedule "0 0 * * *"
Task created successfully!
ID: 123
Name: daily_cleanup
`,
    `$ xano task create -w 40 -f task.xs
Task created from XanoScript file
ID: 123
`,
    `$ xano task create -w 40 -f task.xs -o json
{
  "id": 123,
  "name": "daily_cleanup"
}
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Task name (required if not using file)',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'Task description',
      required: false,
    }),
    schedule: Flags.string({
      char: 's',
      description: 'Cron schedule expression (e.g., "0 0 * * *" for daily at midnight)',
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
    const {flags} = await this.parse(TaskCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let task: Task

      if (flags.file) {
        // Create from XanoScript file
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }

        const xsContent = fs.readFileSync(flags.file, 'utf8')
        task = await client.createTask(workspaceId, xsContent, true) as Task
      } else {
        // Create from flags
        if (!flags.name) {
          this.error('Either --name or --file is required')
        }

        const data = {
          name: flags.name,
          description: flags.description || '',
          schedule: flags.schedule || '',
        }

        task = await client.createTask(workspaceId, data, false) as Task
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(task, null, 2))
      } else {
        this.log('Task created successfully!')
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
