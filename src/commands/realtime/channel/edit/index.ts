import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class RealtimeChannelEdit extends BaseCommand {
  static override description = 'Edit an existing realtime channel'

  static override args = {
    channel_id: Args.string({description: 'Channel ID', required: true}),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    name: Flags.string({description: 'Channel name', required: false}),
    data: Flags.string({char: 'd', description: 'Channel data as JSON', required: false}),
    file: Flags.string({char: 'f', description: 'Path to JSON file', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RealtimeChannelEdit)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      let channelData: Record<string, unknown>
      if (flags.file) {
        if (!fs.existsSync(flags.file)) this.error(`File not found: ${flags.file}`)
        channelData = JSON.parse(fs.readFileSync(flags.file, 'utf8'))
      } else if (flags.data) {
        channelData = JSON.parse(flags.data)
      } else {
        channelData = {}
        if (flags.name) channelData.name = flags.name
        if (Object.keys(channelData).length === 0) this.error('At least one of --name, --data, or --file must be provided')
      }
      const channel = await client.updateRealtimeChannel(workspaceId, args.channel_id, channelData)
      if (flags.output === 'json') {
        this.log(JSON.stringify(channel, null, 2))
      } else {
        this.log('Channel updated successfully!')
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
