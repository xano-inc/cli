import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class McpServerCreate extends BaseCommand {
  static override description = 'Create a new MCP server from XanoScript file'

  static override examples = [
    `$ xano mcp-server create -w 40 -f mcp-server.xs
MCP Server created successfully!
ID: 123
Name: my_mcp_server
`,
    `$ xano mcp-server create -w 40 -f mcp-server.xs -o json
{
  "id": 123,
  "name": "my_mcp_server"
}
`,
  ]

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
    const {flags} = await this.parse(McpServerCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }

      const xsContent = fs.readFileSync(flags.file, 'utf8')
      const server = await client.createMcpServer(workspaceId, xsContent) as {id: number; name: string}

      if (flags.output === 'json') {
        this.log(JSON.stringify(server, null, 2))
      } else {
        this.log('MCP Server created successfully!')
        this.log(`ID: ${server.id}`)
        this.log(`Name: ${server.name}`)
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
