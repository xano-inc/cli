import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableSchemaGet extends BaseCommand {
  static override description = 'Get the full schema of a table'

  static override examples = [
    `$ xano table schema get 123 -w 40
Table schema:
{
  "id": {...},
  "created_at": {...},
  ...
}
`,
    `$ xano table schema get 123 -w 40 -o json
{"id": {...}, "created_at": {...}, ...}
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'json',
      options: ['json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TableSchemaGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const schema = await client.getTableSchema(workspaceId, args.table_id)
      this.log(JSON.stringify(schema, null, 2))
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
