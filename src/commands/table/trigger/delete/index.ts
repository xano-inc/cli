import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableTriggerDelete extends BaseCommand {
  static override description = 'Delete a table trigger'

  static override examples = [
    `$ xano table trigger delete 123 -w 40 --force
Table trigger deleted successfully!
`,
  ]

  static override args = {
    trigger_id: Args.string({
      description: 'Table Trigger ID',
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
    const {args, flags} = await this.parse(TableTriggerDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!flags.force) {
        this.error('Use --force to confirm deletion')
      }

      await client.deleteTableTrigger(workspaceId, args.trigger_id)
      this.log('Table trigger deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
