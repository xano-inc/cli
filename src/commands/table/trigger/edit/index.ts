import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'
import type {TableTrigger} from '../../../../lib/types.js'

export default class TableTriggerEdit extends BaseCommand {
  static override description = 'Edit a table trigger using XanoScript file'

  static override examples = [
    `$ xano table trigger edit 123 -w 40 -f trigger.xs
Table trigger updated successfully!
ID: 123
Name: my_trigger
`,
    `$ xano table trigger edit 123 -w 40 -f trigger.xs -o json
{"id": 123, "name": "my_trigger", ...}
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
    const {args, flags} = await this.parse(TableTriggerEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }

      const xsContent = fs.readFileSync(flags.file, 'utf8')
      const trigger = await client.updateTableTrigger(workspaceId, args.trigger_id, xsContent, true) as TableTrigger

      if (flags.output === 'json') {
        this.log(JSON.stringify(trigger, null, 2))
      } else {
        this.log('Table trigger updated successfully!')
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
