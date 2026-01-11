import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class RealtimeChannelGet extends BaseCommand {
  static override description = 'Get details of a specific realtime channel'

  static override args = {
    channel_id: Args.string({description: 'Channel ID', required: true}),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RealtimeChannelGet)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      const channel = await client.getRealtimeChannel(workspaceId, args.channel_id) as {id: number; name: string}
      if (flags.output === 'json') {
        this.log(JSON.stringify(channel, null, 2))
      } else {
        this.log(`Channel: ${channel.name}`)
        this.log(JSON.stringify(channel, null, 2))
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
