import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class McpServerTriggerDelete extends BaseCommand {
  static override description = 'Delete an MCP server trigger'

  static override args = {
    mcp_server_id: Args.string({description: 'MCP Server ID', required: true}),
    trigger_id: Args.string({description: 'Trigger ID', required: true}),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    force: Flags.boolean({description: 'Skip confirmation', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(McpServerTriggerDelete)
    try {
      if (!flags.force) this.error('Use --force to confirm deletion')
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      await client.deleteMcpServerTrigger(workspaceId, args.mcp_server_id, args.trigger_id)
      this.log('Trigger deleted successfully!')
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
