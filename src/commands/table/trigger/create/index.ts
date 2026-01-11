import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'
import type {TableTrigger} from '../../../../lib/types.js'

export default class TableTriggerCreate extends BaseCommand {
  static override description = 'Create a new table trigger'

  static override examples = [
    `$ xano table trigger create -w 40 -f trigger.xs
Table trigger created successfully!
ID: 123
Name: my_trigger
`,
    `$ xano table trigger create -w 40 --name my_trigger --table 456 --event insert
Table trigger created successfully!
ID: 123
Name: my_trigger
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
      description: 'Path to XanoScript file',
      required: false,
    }),
    name: Flags.string({
      description: 'Trigger name',
      required: false,
    }),
    table: Flags.string({
      char: 't',
      description: 'Table ID',
      required: false,
    }),
    event: Flags.string({
      char: 'e',
      description: 'Trigger event (insert, update, delete)',
      required: false,
      options: ['insert', 'update', 'delete'],
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
    const {flags} = await this.parse(TableTriggerCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let trigger: TableTrigger

      if (flags.file) {
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }

        const xsContent = fs.readFileSync(flags.file, 'utf8')
        trigger = await client.createTableTrigger(workspaceId, xsContent, true) as TableTrigger
      } else if (flags.name && flags.table && flags.event) {
        const data = {
          name: flags.name,
          table_id: Number.parseInt(flags.table, 10),
          event: flags.event,
          description: flags.description || '',
        }
        trigger = await client.createTableTrigger(workspaceId, data, false) as TableTrigger
      } else {
        this.error('Either --file or (--name, --table, and --event) must be provided')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(trigger, null, 2))
      } else {
        this.log('Table trigger created successfully!')
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
