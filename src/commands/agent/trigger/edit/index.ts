import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class AgentTriggerEdit extends BaseCommand {
  static override description = 'Edit an existing agent trigger'

  static override examples = [
    `$ xano agent trigger edit 123 456 -w 40 --name new-name
Trigger updated successfully!
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
    name: Flags.string({
      description: 'Trigger name',
      required: false,
    }),
    data: Flags.string({
      char: 'd',
      description: 'Trigger data as JSON string',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to JSON file with trigger data',
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
    const {args, flags} = await this.parse(AgentTriggerEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let triggerData: Record<string, unknown>

      if (flags.file) {
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }
        const content = fs.readFileSync(flags.file, 'utf8')
        triggerData = JSON.parse(content)
      } else if (flags.data) {
        triggerData = JSON.parse(flags.data)
      } else {
        triggerData = {}
        if (flags.name) triggerData.name = flags.name

        if (Object.keys(triggerData).length === 0) {
          this.error('At least one of --name, --data, or --file must be provided')
        }
      }

      const trigger = await client.updateAgentTrigger(workspaceId, args.agent_id, args.trigger_id, triggerData) as {id: number; name: string}

      if (flags.output === 'json') {
        this.log(JSON.stringify(trigger, null, 2))
      } else {
        this.log('Trigger updated successfully!')
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
