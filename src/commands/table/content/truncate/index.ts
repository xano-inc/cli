import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableContentTruncate extends BaseCommand {
  static override description = 'Truncate all records from a table (delete all data)'

  static override examples = [
    `$ xano table content truncate 123 -w 40 --force
Table truncated successfully! All records have been deleted.
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
    force: Flags.boolean({
      description: 'Skip confirmation (required for truncate)',
      required: false,
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TableContentTruncate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!flags.force) {
        this.error('Use --force to confirm table truncation. This will delete ALL records!')
      }

      await client.truncateTable(workspaceId, args.table_id)
      this.log('Table truncated successfully! All records have been deleted.')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
