import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../../base-command.js'
import {XanoApiClient} from '../../../../../lib/api-client.js'

export default class RealtimeChannelTriggerDelete extends BaseCommand {
  static override description = 'Delete a channel trigger'

  static override args = {
    channel_id: Args.string({description: 'Channel ID', required: true}),
    trigger_id: Args.string({description: 'Trigger ID', required: true}),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    force: Flags.boolean({description: 'Skip confirmation', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RealtimeChannelTriggerDelete)
    try {
      if (!flags.force) this.error('Use --force to confirm deletion')
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      await client.deleteRealtimeChannelTrigger(workspaceId, args.channel_id, args.trigger_id)
      this.log('Trigger deleted successfully!')
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
