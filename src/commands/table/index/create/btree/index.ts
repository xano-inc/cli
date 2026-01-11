import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../../base-command.js'
import {XanoApiClient} from '../../../../../lib/api-client.js'

export default class TableIndexCreateBtree extends BaseCommand {
  static override description = 'Create a btree index on a table'

  static override examples = [
    `$ xano table index create btree 123 -w 40 --columns name,email
Btree index created successfully!
`,
    `$ xano table index create btree 123 -w 40 -f index.json -o json
{"id": 456, "type": "btree", ...}
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
    columns: Flags.string({
      char: 'c',
      description: 'Comma-separated list of column names',
      required: false,
    }),
    data: Flags.string({
      char: 'd',
      description: 'Index definition as JSON string',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to JSON file with index definition',
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
    const {args, flags} = await this.parse(TableIndexCreateBtree)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let indexData: unknown

      if (flags.file) {
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }
        const content = fs.readFileSync(flags.file, 'utf8')
        indexData = JSON.parse(content)
      } else if (flags.data) {
        indexData = JSON.parse(flags.data)
      } else if (flags.columns) {
        const columns = flags.columns.split(',').map((c) => c.trim())
        indexData = {columns}
      } else {
        this.error('Either --columns, --data, or --file must be provided')
      }

      const result = await client.createTableIndexBtree(workspaceId, args.table_id, indexData)

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('Btree index created successfully!')
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
