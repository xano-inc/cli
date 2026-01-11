import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class AgentTriggerDelete extends BaseCommand {
  static override description = 'Delete an agent trigger'

  static override examples = [
    `$ xano agent trigger delete 123 456 -w 40 --force
Trigger deleted successfully!
`,
  ]

  static override args = {
    agent_id: Args.string({
      description: 'Agent ID',
      required: true,
    }),
    trigger_id: Args.string({
      description: 'Trigger ID',
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
    const {args, flags} = await this.parse(AgentTriggerDelete)

    try {
      if (!flags.force) {
        this.error('Use --force to confirm deletion')
      }

      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      await client.deleteAgentTrigger(workspaceId, args.agent_id, args.trigger_id)

      this.log('Trigger deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
