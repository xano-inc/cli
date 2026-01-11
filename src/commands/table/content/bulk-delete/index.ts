import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableContentBulkDelete extends BaseCommand {
  static override description = 'Bulk delete records from a table'

  static override examples = [
    `$ xano table content bulk-delete 123 -w 40 --ids 1,2,3 --force
3 records deleted successfully!
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
    ids: Flags.string({
      description: 'Comma-separated list of record IDs to delete',
      required: true,
    }),
    force: Flags.boolean({
      description: 'Skip confirmation',
      required: false,
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TableContentBulkDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!flags.force) {
        this.error('Use --force to confirm bulk deletion')
      }

      const ids = flags.ids.split(',').map((id) => Number.parseInt(id.trim(), 10))

      if (ids.some((id) => Number.isNaN(id))) {
        this.error('Invalid ID format. IDs must be integers.')
      }

      await client.bulkDeleteTableContent(workspaceId, args.table_id, {ids})
      this.log(`${ids.length} records deleted successfully!`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
