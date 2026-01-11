import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class ToolDelete extends BaseCommand {
  static override description = 'Delete a tool'

  static override args = {
    tool_id: Args.string({description: 'Tool ID', required: true}),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    force: Flags.boolean({description: 'Skip confirmation', default: false}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ToolDelete)
    try {
      if (!flags.force) this.error('Use --force to confirm deletion')
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      await client.deleteTool(workspaceId, args.tool_id)
      this.log('Tool deleted successfully!')
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
