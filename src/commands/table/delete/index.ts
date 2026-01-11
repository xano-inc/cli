import {Args, Flags} from '@oclif/core'
import * as inquirer from 'inquirer'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Table} from '../../../lib/types.js'

export default class TableDelete extends BaseCommand {
  static override description = 'Delete a database table permanently'

  static override examples = [
    `$ xano table delete 123 -w 40
Are you sure you want to delete table 'users' (ID: 123)? This cannot be undone. (y/N) y
Table deleted successfully!
`,
    `$ xano table delete 123 -w 40 --force
Table deleted successfully!
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
      char: 'f',
      description: 'Skip confirmation prompt',
      required: false,
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TableDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Get table info for confirmation
      const table = await client.getTable(workspaceId, args.table_id) as Table

      if (!flags.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete table '${table.name}' (ID: ${table.id})? This cannot be undone.`,
            default: false,
          },
        ])

        if (!confirm) {
          this.log('Delete cancelled.')
          return
        }
      }

      await client.deleteTable(workspaceId, args.table_id)
      this.log('Table deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
