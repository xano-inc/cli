import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'
import type {TableTrigger} from '../../../../lib/types.js'

export default class TableTriggerSecurity extends BaseCommand {
  static override description = 'Update table trigger security configuration'

  static override examples = [
    `$ xano table trigger security 123 -w 40 --apigroup-guid abc123
Table trigger security updated successfully!
`,
    `$ xano table trigger security 123 -w 40 --clear
Table trigger security cleared (no API group restriction)
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
    'apigroup-guid': Flags.string({
      char: 'g',
      description: 'API Group GUID to restrict access',
      required: false,
    }),
    clear: Flags.boolean({
      description: 'Clear security restriction (remove API group requirement)',
      required: false,
      default: false,
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
    const {args, flags} = await this.parse(TableTriggerSecurity)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!flags['apigroup-guid'] && !flags.clear) {
        this.error('Either --apigroup-guid or --clear must be provided')
      }

      const securityData = flags.clear
        ? {guid: ''}
        : {guid: flags['apigroup-guid'] || ''}

      const result = await client.updateTableTriggerSecurity(
        workspaceId,
        args.trigger_id,
        securityData,
      ) as TableTrigger

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        if (flags.clear) {
          this.log('Table trigger security cleared (no API group restriction)')
        } else {
          this.log('Table trigger security updated successfully!')
        }
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)
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
