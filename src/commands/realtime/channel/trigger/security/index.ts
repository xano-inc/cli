import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../../base-command.js'
import {XanoApiClient} from '../../../../../lib/api-client.js'

export default class RealtimeChannelTriggerSecurity extends BaseCommand {
  static override description = 'Update security settings for a channel trigger'

  static override args = {
    channel_id: Args.string({description: 'Channel ID', required: true}),
    trigger_id: Args.string({description: 'Trigger ID', required: true}),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    guid: Flags.string({description: 'New GUID for the trigger', required: true}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RealtimeChannelTriggerSecurity)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      const result = await client.updateRealtimeChannelTriggerSecurity(workspaceId, args.channel_id, args.trigger_id, {guid: flags.guid})
      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('Trigger security updated successfully!')
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
