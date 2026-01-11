import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class McpServerTriggerGet extends BaseCommand {
  static override description = 'Get details of a specific MCP server trigger'

  static override args = {
    mcp_server_id: Args.string({description: 'MCP Server ID', required: true}),
    trigger_id: Args.string({description: 'Trigger ID', required: true}),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(McpServerTriggerGet)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      const trigger = await client.getMcpServerTrigger(workspaceId, args.mcp_server_id, args.trigger_id) as {id: number; name: string}
      if (flags.output === 'json') {
        this.log(JSON.stringify(trigger, null, 2))
      } else {
        this.log(`Trigger: ${trigger.name}`)
        this.log(JSON.stringify(trigger, null, 2))
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
