import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

interface Agent {
  id: number
  name: string
  description?: string
}

export default class AgentList extends BaseCommand {
  static override description = 'List all agents in a workspace'

  static override examples = [
    `$ xano agent list -w 40
Available agents:
  - my-agent (ID: 1)
  - another-agent (ID: 2)
`,
    `$ xano agent list -w 40 -o json
[{"id": 1, "name": "my-agent"}]
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
    branch: Flags.string({
      char: 'b',
      description: 'Branch label',
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
    const {flags} = await this.parse(AgentList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listAgents(workspaceId, {
        branch: flags.branch,
      }) as {items?: Agent[]} | Agent[]

      // Handle both paginated response {items: [...]} and direct array
      const items = Array.isArray(response) ? response : (response?.items || []) as Agent[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No agents found')
        } else {
          this.log('Available agents:')
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
