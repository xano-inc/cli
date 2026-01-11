import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Trigger} from '../../../lib/types.js'

export default class TriggerCreate extends BaseCommand {
  static override description = 'Create a new workspace trigger'

  static override examples = [
    `$ xano trigger create -w 40 -f trigger.xs
Trigger created successfully!
ID: 123
Name: my_trigger
`,
    `$ xano trigger create -w 40 --name my_trigger --description "My trigger"
Trigger created successfully!
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
    const {flags} = await this.parse(TriggerCreate)

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
        trigger = await client.createTrigger(workspaceId, xsContent, true) as Trigger
      } else if (flags.name) {
        const data = {
          name: flags.name,
          description: flags.description || '',
        }
        trigger = await client.createTrigger(workspaceId, data, false) as Trigger
      } else {
        this.error('Either --file or --name must be provided')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(trigger, null, 2))
      } else {
        this.log('Trigger created successfully!')
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
