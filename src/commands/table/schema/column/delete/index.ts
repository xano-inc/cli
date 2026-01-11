import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../../base-command.js'
import {XanoApiClient} from '../../../../../lib/api-client.js'

export default class TableSchemaColumnDelete extends BaseCommand {
  static override description = 'Delete a column from a table schema'

  static override examples = [
    `$ xano table schema column delete 123 old_column -w 40 --force
Column 'old_column' deleted successfully!
`,
  ]

  static override args = {
    table_id: Args.string({
      description: 'Table ID',
      required: true,
    }),
    column_name: Args.string({
      description: 'Column name to delete',
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
    force: Flags.boolean({
      description: 'Skip confirmation',
      required: false,
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TableSchemaColumnDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!flags.force) {
        this.error('Use --force to confirm column deletion')
      }

      await client.deleteTableSchemaColumn(workspaceId, args.table_id, args.column_name)
      this.log(`Column '${args.column_name}' deleted successfully!`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
