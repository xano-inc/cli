import {Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TriggerHistoryList extends BaseCommand {
  static override description = 'List trigger execution history for a workspace'

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID'}),
    page: Flags.integer({default: 1}),
    'per-page': Flags.integer({default: 50}),
    output: Flags.string({char: 'o', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TriggerHistoryList)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listTriggerHistory(workspaceId, {
        page: flags.page, per_page: flags['per-page'],
      }) as {items?: unknown[]} | unknown[]

      const items = Array.isArray(response) ? response : ((response as {items?: unknown[]})?.items || [])

      this.log(flags.output === 'json' ? JSON.stringify(items, null, 2) :
        items.length === 0 ? 'No trigger history found' : `Found ${items.length} trigger history entries`)
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
