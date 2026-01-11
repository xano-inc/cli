import {Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

interface HistoryItem {
  id: number
  created_at: string
  status?: number
  method?: string
  path?: string
}

export default class RequestHistorySearch extends BaseCommand {
  static override description = 'Search API request history for a workspace'

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID'}),
    method: Flags.string({description: 'Filter by HTTP method'}),
    status: Flags.integer({description: 'Filter by status code'}),
    path: Flags.string({description: 'Filter by path'}),
    'start-date': Flags.string({description: 'Filter from date (YYYY-MM-DD)'}),
    'end-date': Flags.string({description: 'Filter to date (YYYY-MM-DD)'}),
    output: Flags.string({char: 'o', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RequestHistorySearch)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const searchParams: Record<string, unknown> = {}
      if (flags.method) searchParams.method = flags.method
      if (flags.status) searchParams.status = flags.status
      if (flags.path) searchParams.path = flags.path
      if (flags['start-date']) searchParams.start_date = flags['start-date']
      if (flags['end-date']) searchParams.end_date = flags['end-date']

      const response = await client.searchRequestHistory(workspaceId, searchParams) as {items?: HistoryItem[]} | HistoryItem[]
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
