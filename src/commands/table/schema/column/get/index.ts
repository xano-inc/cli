import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../../base-command.js'
import {XanoApiClient} from '../../../../../lib/api-client.js'

export default class TableSchemaColumnGet extends BaseCommand {
  static override description = 'Get details of a specific column in a table schema'

  static override examples = [
    `$ xano table schema column get 123 name -w 40
Column: name
{"type": "text", "nullable": false, ...}
`,
  ]

  static override args = {
    table_id: Args.string({
      description: 'Table ID',
      required: true,
    }),
    column_name: Args.string({
      description: 'Column name',
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'json',
      options: ['json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TableSchemaColumnGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const column = await client.getTableSchemaColumn(workspaceId, args.table_id, args.column_name)
      this.log(`Column: ${args.column_name}`)
      this.log(JSON.stringify(column, null, 2))
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
