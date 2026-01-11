import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableContentSearch extends BaseCommand {
  static override description = 'Search records in a table'

  static override examples = [
    `$ xano table content search 123 -w 40 --query '{"name": "test"}'
Found 2 records:
  - ID: 1
  - ID: 2
`,
    `$ xano table content search 123 -w 40 -f search.json -o json
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
    query: Flags.string({
      char: 'q',
      description: 'Search query as JSON string',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to JSON file with search query',
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
    const {args, flags} = await this.parse(TableContentSearch)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let searchData: unknown

      if (flags.file) {
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }
        const content = fs.readFileSync(flags.file, 'utf8')
        searchData = JSON.parse(content)
      } else if (flags.query) {
        searchData = JSON.parse(flags.query)
      } else {
        this.error('Either --query or --file must be provided')
      }

      const result = await client.searchTableContent(workspaceId, args.table_id, searchData) as {items?: unknown[]} | unknown[]
      const records = Array.isArray(result) ? result : (result.items || [])

      if (flags.output === 'json') {
        this.log(JSON.stringify(records, null, 2))
      } else {
        if (records.length === 0) {
          this.log('No records found matching search criteria')
        } else {
          this.log(`Found ${records.length} records:`)
          for (const record of records as Array<{id: number}>) {
            this.log(`  - ID: ${record.id}`)
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
