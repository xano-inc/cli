import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class McpServerEdit extends BaseCommand {
  static override description = 'Edit an existing MCP server from XanoScript file'

  static override examples = [
    `$ xano mcp-server edit 123 -w 40 -f mcp-server.xs
MCP Server updated successfully!
`,
    `$ xano mcp-server edit 123 -w 40 -f mcp-server.xs -o json
{"id": 123, "name": "updated_mcp_server", ...}
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
    file: Flags.string({
      char: 'f',
      description: 'Path to XanoScript file (required)',
      required: true,
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
    const {args, flags} = await this.parse(McpServerEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }

      const xsContent = fs.readFileSync(flags.file, 'utf8')
      const server = await client.updateMcpServer(workspaceId, args.mcp_server_id, xsContent) as {id: number; name: string}

      if (flags.output === 'json') {
        this.log(JSON.stringify(server, null, 2))
      } else {
        this.log('MCP Server updated successfully!')
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
