import {Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

interface Channel {
  id: number
  name: string
}

export default class RealtimeChannelList extends BaseCommand {
  static override description = 'List all realtime channels in a workspace'

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    branch: Flags.string({char: 'b', description: 'Branch label', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RealtimeChannelList)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      const response = await client.listRealtimeChannels(workspaceId, {branch: flags.branch})
      const items = (Array.isArray(response) ? response : []) as Channel[]
      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No channels found')
        } else {
          this.log('Available channels:')
          for (const item of items) {
            this.log(`  - ${item.name} (ID: ${item.id})`)
          }
        }
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
