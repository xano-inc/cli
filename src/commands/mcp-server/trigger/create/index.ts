import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class McpServerTriggerCreate extends BaseCommand {
  static override description = 'Create a new trigger for an MCP server'

  static override args = {
    mcp_server_id: Args.string({description: 'MCP Server ID', required: true}),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    name: Flags.string({description: 'Trigger name', required: false}),
    data: Flags.string({char: 'd', description: 'Trigger data as JSON', required: false}),
    file: Flags.string({char: 'f', description: 'Path to JSON file', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(McpServerTriggerCreate)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      let triggerData: Record<string, unknown>
      if (flags.file) {
        if (!fs.existsSync(flags.file)) this.error(`File not found: ${flags.file}`)
        triggerData = JSON.parse(fs.readFileSync(flags.file, 'utf8'))
      } else if (flags.data) {
        triggerData = JSON.parse(flags.data)
      } else if (flags.name) {
        triggerData = {name: flags.name}
      } else {
        this.error('Either --name, --data, or --file must be provided')
      }
      const trigger = await client.createMcpServerTrigger(workspaceId, args.mcp_server_id, triggerData) as {id: number}
      if (flags.output === 'json') {
        this.log(JSON.stringify(trigger, null, 2))
      } else {
        this.log('Trigger created successfully!')
        this.log(`ID: ${trigger.id}`)
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
