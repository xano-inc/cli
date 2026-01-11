import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

interface Trigger {
  id: number
  name: string
}

export default class McpServerTriggerList extends BaseCommand {
  static override description = 'List all triggers for an MCP server'

  static override examples = [
    `$ xano mcp-server trigger list 123 -w 40
Available triggers:
  - on_request (ID: 1)
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
    const {args, flags} = await this.parse(McpServerTriggerList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listMcpServerTriggers(workspaceId, args.mcp_server_id)
      const items = (Array.isArray(response) ? response : []) as Trigger[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No triggers found')
        } else {
          this.log('Available triggers:')
          for (const item of items) {
            this.log(`  - ${item.name} (ID: ${item.id})`)
          }
        }
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
