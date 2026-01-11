import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class AgentEdit extends BaseCommand {
  static override description = 'Edit an existing agent from XanoScript file'

  static override examples = [
    `$ xano agent edit 123 -w 40 -f agent.xs
Agent updated successfully!
`,
    `$ xano agent edit 123 -w 40 -f agent.xs -o json
{"id": 123, "name": "updated_agent", ...}
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
    const {args, flags} = await this.parse(AgentEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }

      const xsContent = fs.readFileSync(flags.file, 'utf8')
      const agent = await client.updateAgent(workspaceId, args.agent_id, xsContent) as {id: number; name: string}

      if (flags.output === 'json') {
        this.log(JSON.stringify(agent, null, 2))
      } else {
        this.log('Agent updated successfully!')
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
