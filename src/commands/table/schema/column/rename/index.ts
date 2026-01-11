import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../../base-command.js'
import {XanoApiClient} from '../../../../../lib/api-client.js'

export default class TableSchemaColumnRename extends BaseCommand {
  static override description = 'Rename a column in a table schema'

  static override examples = [
    `$ xano table schema column rename 123 -w 40 --from old_name --to new_name
Column renamed from 'old_name' to 'new_name' successfully!
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
    'old-name': Flags.string({
      description: 'Current column name',
      required: true,
    }),
    'new-name': Flags.string({
      description: 'New column name',
      required: true,
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
    const {args, flags} = await this.parse(TableSchemaColumnRename)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const result = await client.renameTableSchemaColumn(workspaceId, args.table_id, {
        old_name: flags['old-name'],
        new_name: flags['new-name'],
      })

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(`Column renamed from '${flags['old-name']}' to '${flags['new-name']}' successfully!`)
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
