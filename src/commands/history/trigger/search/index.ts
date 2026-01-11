import {Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TriggerHistorySearch extends BaseCommand {
  static override description = 'Search trigger execution history'

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID'}),
    'trigger-id': Flags.integer({description: 'Filter by trigger ID'}),
    status: Flags.string({description: 'Filter by status'}),
    'start-date': Flags.string({description: 'Filter from date'}),
    'end-date': Flags.string({description: 'Filter to date'}),
    output: Flags.string({char: 'o', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TriggerHistorySearch)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const searchParams: Record<string, unknown> = {}
      if (flags['trigger-id']) searchParams.trigger_id = flags['trigger-id']
      if (flags.status) searchParams.status = flags.status
      if (flags['start-date']) searchParams.start_date = flags['start-date']
      if (flags['end-date']) searchParams.end_date = flags['end-date']

      const response = await client.searchTriggerHistory(workspaceId, searchParams) as {items?: unknown[]} | unknown[]
      const items = Array.isArray(response) ? response : ((response as {items?: unknown[]})?.items || [])

      this.log(flags.output === 'json' ? JSON.stringify(items, null, 2) : `Found ${items.length} trigger history entries`)
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
