import {Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

interface HistoryItem {
  id: number
  created_at: string
  status?: number
  method?: string
  path?: string
  duration?: number
}

export default class RequestHistoryList extends BaseCommand {
  static override description = 'List API request history for a workspace'

  static override examples = [
    `$ xano history request list -w 40
Request History:
  - [2024-01-01] GET /api/users (200)
`,
    `$ xano history request list -w 40 -o json
[{"id": 1, "method": "GET", ...}]
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
    page: Flags.integer({
      description: 'Page number',
      default: 1,
    }),
    'per-page': Flags.integer({
      description: 'Items per page',
      default: 50,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RequestHistoryList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listRequestHistory(workspaceId, {
        page: flags.page,
        per_page: flags['per-page'],
      }) as {items?: HistoryItem[]} | HistoryItem[]

      const items = Array.isArray(response) ? response : (response?.items || []) as HistoryItem[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No request history found')
        } else {
          this.log('Request History:')
          for (const item of items) {
            const date = item.created_at?.split(' ')[0] || 'unknown'
            this.log(`  - [${date}] ${item.method || 'REQUEST'} ${item.path || ''} (${item.status || 'N/A'})`)
          }
        }
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
