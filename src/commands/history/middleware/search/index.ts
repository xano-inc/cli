import {Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class MiddlewareHistorySearch extends BaseCommand {
  static override description = 'Search middleware execution history'

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID'}),
    'middleware-id': Flags.integer({description: 'Filter by middleware ID'}),
    status: Flags.string({description: 'Filter by status'}),
    'start-date': Flags.string({description: 'Filter from date'}),
    'end-date': Flags.string({description: 'Filter to date'}),
    output: Flags.string({char: 'o', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(MiddlewareHistorySearch)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const searchParams: Record<string, unknown> = {}
      if (flags['middleware-id']) searchParams.middleware_id = flags['middleware-id']
      if (flags.status) searchParams.status = flags.status
      if (flags['start-date']) searchParams.start_date = flags['start-date']
      if (flags['end-date']) searchParams.end_date = flags['end-date']

      const response = await client.searchMiddlewareHistory(workspaceId, searchParams) as {items?: unknown[]} | unknown[]
      const items = Array.isArray(response) ? response : ((response as {items?: unknown[]})?.items || [])

      this.log(flags.output === 'json' ? JSON.stringify(items, null, 2) : `Found ${items.length} middleware history entries`)
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
