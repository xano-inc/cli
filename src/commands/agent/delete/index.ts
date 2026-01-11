import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class AgentDelete extends BaseCommand {
  static override description = 'Delete an agent'

  static override examples = [
    `$ xano agent delete 123 -w 40 --force
Agent deleted successfully!
`,
  ]

  static override args = {
    agent_id: Args.string({
      description: 'Agent ID',
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
    const {args, flags} = await this.parse(AgentDelete)

    try {
      if (!flags.force) {
        this.error('Use --force to confirm deletion')
      }

      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      await client.deleteAgent(workspaceId, args.agent_id)

      this.log('Agent deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
