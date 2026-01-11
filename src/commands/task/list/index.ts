import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Task} from '../../../lib/types.js'

export default class TaskList extends BaseCommand {
  static override description = 'List all scheduled tasks in a workspace'

  static override examples = [
    `$ xano task list -w 40
Available tasks:
  - daily_cleanup (ID: 1)
  - hourly_sync (ID: 2)
`,
    `$ xano task list -w 40 -o json
[
  {
    "id": 1,
    "name": "daily_cleanup"
  }
]
`,
  ]

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
      options: ['summary', 'json'],
    }),
    include_xanoscript: Flags.boolean({
      description: 'Include XanoScript in response',
      required: false,
      default: false,
    }),
    page: Flags.integer({
      description: 'Page number for pagination',
      required: false,
      default: 1,
    }),
    per_page: Flags.integer({
      description: 'Number of results per page',
      required: false,
      default: 50,
    }),
    search: Flags.string({
      description: 'Search filter',
      required: false,
      default: '',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TaskList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listTasks(workspaceId, {
        page: flags.page,
        per_page: flags.per_page,
        search: flags.search,
        include_xanoscript: flags.include_xanoscript,
      })

      const items = (Array.isArray(response) ? response : response.items) as Task[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No tasks found')
        } else {
          this.log('Available tasks:')
          for (const item of items) {
            const schedule = item.schedule ? ` [${item.schedule}]` : ''
            this.log(`  - ${item.name} (ID: ${item.id})${schedule}`)
          }
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
