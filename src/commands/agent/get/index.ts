import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class AgentGet extends BaseCommand {
  static override description = 'Get details of a specific agent'

  static override examples = [
    `$ xano agent get 123 -w 40
Agent: my-agent
{
  "id": 123,
  "name": "my-agent",
  ...
}
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(AgentGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const agent = await client.getAgent(workspaceId, args.agent_id) as {id: number; name: string}

      if (flags.output === 'json') {
        this.log(JSON.stringify(agent, null, 2))
      } else {
        this.log(`Agent: ${agent.name}`)
        this.log(JSON.stringify(agent, null, 2))
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
