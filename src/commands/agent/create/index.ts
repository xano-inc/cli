import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class AgentCreate extends BaseCommand {
  static override description = 'Create a new agent from XanoScript file'

  static override examples = [
    `$ xano agent create -w 40 -f agent.xs
Agent created successfully!
ID: 123
Name: my_agent
`,
    `$ xano agent create -w 40 -f agent.xs -o json
{
  "id": 123,
  "name": "my_agent"
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
    const {flags} = await this.parse(AgentCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }

      const xsContent = fs.readFileSync(flags.file, 'utf8')
      const agent = await client.createAgent(workspaceId, xsContent) as {id: number; name: string}

      if (flags.output === 'json') {
        this.log(JSON.stringify(agent, null, 2))
      } else {
        this.log('Agent created successfully!')
        this.log(`ID: ${agent.id}`)
        this.log(`Name: ${agent.name}`)
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
