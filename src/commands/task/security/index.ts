import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Task} from '../../../lib/types.js'

export default class TaskSecurity extends BaseCommand {
  static override description = 'Update task security configuration'

  static override examples = [
    `$ xano task security 123 -w 40 --apigroup-guid abc123
Task security updated successfully!
`,
    `$ xano task security 123 -w 40 --clear
Task security cleared (no API group restriction)
`,
    `$ xano task security 123 -w 40 -o json
{
  "id": 123,
  "name": "daily_cleanup",
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
    'apigroup-guid': Flags.string({
      char: 'g',
      description: 'API Group GUID to restrict access',
      required: false,
    }),
    clear: Flags.boolean({
      description: 'Clear security restriction (remove API group requirement)',
      required: false,
      default: false,
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
    const {args, flags} = await this.parse(TaskSecurity)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Validate that either apigroup-guid or clear is provided
      if (!flags['apigroup-guid'] && !flags.clear) {
        this.error('Either --apigroup-guid or --clear must be provided')
      }

      const securityData = flags.clear
        ? {guid: ''}
        : {guid: flags['apigroup-guid'] || ''}

      const result = await client.updateTaskSecurity(
        workspaceId,
        args.task_id,
        securityData,
      ) as Task

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        if (flags.clear) {
          this.log('Task security cleared (no API group restriction)')
        } else {
          this.log('Task security updated successfully!')
        }
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)
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
