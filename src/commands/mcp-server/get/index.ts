import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class McpServerGet extends BaseCommand {
  static override description = 'Get details of a specific MCP server'

  static override examples = [
    `$ xano mcp-server get 123 -w 40
MCP Server: my-server
{...}
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(McpServerGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const server = await client.getMcpServer(workspaceId, args.mcp_server_id) as {id: number; name: string}

      if (flags.output === 'json') {
        this.log(JSON.stringify(server, null, 2))
      } else {
        this.log(`MCP Server: ${server.name}`)
        this.log(JSON.stringify(server, null, 2))
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
