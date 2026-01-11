import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../../base-command.js'
import {XanoApiClient} from '../../../../../lib/api-client.js'

export default class TableSchemaColumnAdd extends BaseCommand {
  static override description = 'Add a new column to a table schema'

  static override examples = [
    `$ xano table schema column add 123 -w 40 --type text --name email
Column 'email' added successfully!
`,
    `$ xano table schema column add 123 -w 40 --type int --data '{"name": "count", "default": 0}'
Column 'count' added successfully!
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
    type: Flags.string({
      char: 't',
      description: 'Column type (text, int, bool, decimal, timestamp, etc.)',
      required: true,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Column name',
      required: false,
    }),
    data: Flags.string({
      char: 'd',
      description: 'Column definition as JSON string',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to JSON file with column definition',
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
    const {args, flags} = await this.parse(TableSchemaColumnAdd)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let columnData: Record<string, unknown>

      if (flags.file) {
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }
        const content = fs.readFileSync(flags.file, 'utf8')
        columnData = JSON.parse(content)
      } else if (flags.data) {
        columnData = JSON.parse(flags.data)
      } else if (flags.name) {
        columnData = {name: flags.name}
      } else {
        this.error('Either --name, --data, or --file must be provided')
      }

      const result = await client.addTableSchemaColumn(workspaceId, args.table_id, flags.type, columnData)

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        const name = columnData.name || 'new column'
        this.log(`Column '${name}' added successfully!`)
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
