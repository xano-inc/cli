import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class McpServerDelete extends BaseCommand {
  static override description = 'Delete an MCP server'

  static override examples = [
    `$ xano mcp-server delete 123 -w 40 --force
MCP Server deleted successfully!
`,
  ]

  static override args = {
    mcp_server_id: Args.string({
      description: 'MCP Server ID',
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
    const {args, flags} = await this.parse(McpServerDelete)

    try {
      if (!flags.force) {
        this.error('Use --force to confirm deletion')
      }

      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      await client.deleteMcpServer(workspaceId, args.mcp_server_id)

      this.log('MCP Server deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
