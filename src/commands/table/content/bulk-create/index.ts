import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableContentBulkCreate extends BaseCommand {
  static override description = 'Bulk create records in a table'

  static override examples = [
    `$ xano table content bulk-create 123 -w 40 --data '[{"name": "a"}, {"name": "b"}]'
2 records created successfully!
`,
    `$ xano table content bulk-create 123 -w 40 -f records.json -o json
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
    data: Flags.string({
      char: 'd',
      description: 'Array of records as JSON string',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to JSON file with array of records',
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
    const {args, flags} = await this.parse(TableContentBulkCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let data: unknown[]

      if (flags.file) {
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }
        const content = fs.readFileSync(flags.file, 'utf8')
        data = JSON.parse(content)
      } else if (flags.data) {
        data = JSON.parse(flags.data)
      } else {
        this.error('Either --data or --file must be provided')
      }

      if (!Array.isArray(data)) {
        this.error('Data must be an array of records')
      }

      const result = await client.bulkCreateTableContent(workspaceId, args.table_id, data) as unknown[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        const count = Array.isArray(result) ? result.length : data.length
        this.log(`${count} records created successfully!`)
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
