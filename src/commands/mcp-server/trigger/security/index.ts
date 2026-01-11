import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class McpServerTriggerSecurity extends BaseCommand {
  static override description = 'Update security settings for an MCP server trigger'

  static override args = {
    mcp_server_id: Args.string({description: 'MCP Server ID', required: true}),
    trigger_id: Args.string({description: 'Trigger ID', required: true}),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    guid: Flags.string({description: 'New GUID for the trigger', required: true}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(McpServerTriggerSecurity)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      const result = await client.updateMcpServerTriggerSecurity(workspaceId, args.mcp_server_id, args.trigger_id, {guid: flags.guid})
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
