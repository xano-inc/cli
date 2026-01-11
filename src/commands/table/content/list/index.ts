import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableContentList extends BaseCommand {
  static override description = 'List records in a table'

  static override examples = [
    `$ xano table content list 123 -w 40
Records in table:
  - ID: 1
  - ID: 2
`,
    `$ xano table content list 123 -w 40 -o json
[{"id": 1, ...}, {"id": 2, ...}]
`,
  ]

  static override args = {
    table_id: Args.string({
      description: 'Table ID',
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TableContentList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const result = await client.listTableContent(workspaceId, args.table_id, {
        page: flags.page,
        per_page: flags.per_page,
      }) as {items?: unknown[]} | unknown[]

      const records = Array.isArray(result) ? result : (result.items || [])

      if (flags.output === 'json') {
        this.log(JSON.stringify(records, null, 2))
      } else {
        if (records.length === 0) {
          this.log('No records found')
        } else {
          this.log('Records in table:')
          for (const record of records as Array<{id: number}>) {
            this.log(`  - ID: ${record.id}`)
          }
          this.log(`\nTotal: ${records.length} records`)
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
