import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class ToolGet extends BaseCommand {
  static override description = 'Get details of a specific tool'

  static override args = {
    tool_id: Args.string({description: 'Tool ID', required: true}),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ToolGet)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      const tool = await client.getTool(workspaceId, args.tool_id) as {id: number; name: string}
      if (flags.output === 'json') {
        this.log(JSON.stringify(tool, null, 2))
      } else {
        this.log(`Tool: ${tool.name}`)
        this.log(JSON.stringify(tool, null, 2))
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
