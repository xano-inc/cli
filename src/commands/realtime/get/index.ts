import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class RealtimeGet extends BaseCommand {
  static override description = 'Get realtime configuration for a workspace'

  static override examples = [
    `$ xano realtime get -w 40
Realtime configuration:
{...}
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RealtimeGet)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      const config = await client.getRealtime(workspaceId)
      if (flags.output === 'json') {
        this.log(JSON.stringify(config, null, 2))
      } else {
        this.log('Realtime configuration:')
        this.log(JSON.stringify(config, null, 2))
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
