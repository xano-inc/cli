import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Addon} from '../../../lib/types.js'

export default class AddonSecurity extends BaseCommand {
  static override description = 'Update addon security configuration'

  static override examples = [
    `$ xano addon security 123 -w 40 --apigroup-guid abc123
Addon security updated successfully!
`,
    `$ xano addon security 123 -w 40 --clear
Addon security cleared (no API group restriction)
`,
    `$ xano addon security 123 -w 40 -o json
{
  "id": 123,
  "name": "redis_cache",
  ...
}
`,
  ]

  static override args = {
    addon_id: Args.string({
      description: 'Addon ID',
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
    const {args, flags} = await this.parse(AddonSecurity)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Validate that either apigroup-guid or clear is provided
      if (!flags['apigroup-guid'] && !flags.clear) {
        this.error('Either --apigroup-guid or --clear must be provided')
      }

      const securityData = flags.clear
        ? {guid: ''}
        : {guid: flags['apigroup-guid'] || ''}

      const result = await client.updateAddonSecurity(
        workspaceId,
        args.addon_id,
        securityData,
      ) as Addon

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        if (flags.clear) {
          this.log('Addon security cleared (no API group restriction)')
        } else {
          this.log('Addon security updated successfully!')
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
