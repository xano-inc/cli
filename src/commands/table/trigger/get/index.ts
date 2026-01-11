import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'
import type {TableTrigger} from '../../../../lib/types.js'

export default class TableTriggerGet extends BaseCommand {
  static override description = 'Get table trigger details'

  static override examples = [
    `$ xano table trigger get 123 -w 40
Table Trigger: my_trigger
ID: 123
Table ID: 456
Event: insert
`,
    `$ xano table trigger get 123 -w 40 -o json
{"id": 123, "name": "my_trigger", "table_id": 456, "event": "insert", ...}
`,
    `$ xano table trigger get 123 -w 40 -o xs
trigger my_trigger { ... }
`,
  ]

  static override args = {
    trigger_id: Args.string({
      description: 'Table Trigger ID',
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
    const {args, flags} = await this.parse(TableTriggerGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const includeXanoscript = flags.output === 'xs'
      const trigger = await client.getTableTrigger(workspaceId, args.trigger_id, includeXanoscript) as TableTrigger

      if (flags.output === 'json') {
        this.log(JSON.stringify(trigger, null, 2))
      } else if (flags.output === 'xs') {
        if (trigger.xanoscript && trigger.xanoscript.status === 'ok' && trigger.xanoscript.value) {
          this.log(trigger.xanoscript.value)
        } else {
          this.error('XanoScript not available for this table trigger')
        }
      } else {
        this.log(`Table Trigger: ${trigger.name}`)
        this.log(`ID: ${trigger.id}`)
        this.log(`Table ID: ${trigger.table_id}`)
        this.log(`Event: ${trigger.event}`)
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
