import {Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'
import type {TableTrigger} from '../../../../lib/types.js'

export default class TableTriggerList extends BaseCommand {
  static override description = 'List table triggers'

  static override examples = [
    `$ xano table trigger list -w 40
Available table triggers:
  - my_trigger (ID: 1, table: 123, event: insert)
`,
    `$ xano table trigger list -w 40 -o json
[{"id": 1, "name": "my_trigger", "table_id": 123, "event": "insert", ...}]
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
      required: false,
      default: 1,
    }),
    per_page: Flags.integer({
      description: 'Items per page',
      required: false,
      default: 50,
    }),
    search: Flags.string({
      description: 'Search filter',
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
    const {flags} = await this.parse(TableTriggerList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const result = await client.listTableTriggers(workspaceId, {
        page: flags.page,
        per_page: flags.per_page,
        search: flags.search,
      })

      // Handle both array and paginated response formats
      const triggers = Array.isArray(result) ? result : (result.items || [])

      if (flags.output === 'json') {
        this.log(JSON.stringify(triggers, null, 2))
      } else {
        if (triggers.length === 0) {
          this.log('No table triggers found')
        } else {
          this.log('Available table triggers:')
          for (const trigger of triggers as TableTrigger[]) {
            this.log(`  - ${trigger.name} (ID: ${trigger.id}, table: ${trigger.table_id}, event: ${trigger.event})`)
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
