import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Trigger} from '../../../lib/types.js'

export default class TriggerEdit extends BaseCommand {
  static override description = 'Edit a workspace trigger'

  static override examples = [
    `$ xano trigger edit 123 -w 40 --description "Updated description"
Trigger updated successfully!
ID: 123
Name: my_trigger
`,
    `$ xano trigger edit 123 -w 40 -f trigger.xs
Trigger updated successfully!
ID: 123
Name: my_trigger
`,
  ]

  static override args = {
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
    file: Flags.string({
      char: 'f',
      description: 'Path to XanoScript file',
      required: false,
    }),
    name: Flags.string({
      description: 'Trigger name',
      required: false,
    }),
    description: Flags.string({
      description: 'Trigger description',
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
    const {args, flags} = await this.parse(TriggerEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let trigger: Trigger

      if (flags.file) {
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }

        const xsContent = fs.readFileSync(flags.file, 'utf8')
        trigger = await client.updateTrigger(workspaceId, args.trigger_id, xsContent, true) as Trigger
      } else {
        const data: Record<string, string> = {}
        if (flags.name) data.name = flags.name
        if (flags.description !== undefined) data.description = flags.description

        if (Object.keys(data).length === 0) {
          this.error('At least one of --file, --name, or --description must be provided')
        }

        trigger = await client.updateTrigger(workspaceId, args.trigger_id, data, false) as Trigger
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(trigger, null, 2))
      } else {
        this.log('Trigger updated successfully!')
        this.log(`ID: ${trigger.id}`)
        this.log(`Name: ${trigger.name}`)
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
