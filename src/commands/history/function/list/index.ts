import {Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

interface HistoryItem {
  id: number
  created_at: string
  function_id?: number
  name?: string
  status?: string
  duration?: number
}

export default class FunctionHistoryList extends BaseCommand {
  static override description = 'List function execution history for a workspace'

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID'}),
    page: Flags.integer({default: 1}),
    'per-page': Flags.integer({default: 50}),
    output: Flags.string({char: 'o', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(FunctionHistoryList)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listFunctionHistory(workspaceId, {
        page: flags.page,
        per_page: flags['per-page'],
      }) as {items?: HistoryItem[]} | HistoryItem[]

      const items = Array.isArray(response) ? response : (response?.items || []) as HistoryItem[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No function history found')
        } else {
          this.log('Function History:')
          for (const item of items) {
            const date = item.created_at?.split(' ')[0] || 'unknown'
            this.log(`  - [${date}] ${item.name || `Function ${item.function_id}`} (${item.status || 'N/A'})`)
          }
        }
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
