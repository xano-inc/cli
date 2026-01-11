import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Trigger} from '../../../lib/types.js'

export default class TriggerGet extends BaseCommand {
  static override description = 'Get workspace trigger details'

  static override examples = [
    `$ xano trigger get 123 -w 40
Trigger: my_trigger
ID: 123
GUID: abc123
`,
    `$ xano trigger get 123 -w 40 -o json
{"id": 123, "name": "my_trigger", ...}
`,
    `$ xano trigger get 123 -w 40 -o xs
trigger my_trigger { ... }
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json', 'xs'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TriggerGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const includeXanoscript = flags.output === 'xs'
      const trigger = await client.getTrigger(workspaceId, args.trigger_id, includeXanoscript) as Trigger

      if (flags.output === 'json') {
        this.log(JSON.stringify(trigger, null, 2))
      } else if (flags.output === 'xs') {
        if (trigger.xanoscript && trigger.xanoscript.status === 'ok' && trigger.xanoscript.value) {
          this.log(trigger.xanoscript.value)
        } else {
          this.error('XanoScript not available for this trigger')
        }
      } else {
        this.log(`Trigger: ${trigger.name}`)
        this.log(`ID: ${trigger.id}`)
        this.log(`GUID: ${trigger.guid}`)
        if (trigger.description) {
          this.log(`Description: ${trigger.description}`)
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
