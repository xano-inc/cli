import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Addon} from '../../../lib/types.js'

export default class AddonGet extends BaseCommand {
  static override description = 'Get details of a specific addon'

  static override examples = [
    `$ xano addon get 123 -w 40
Addon: redis_cache
ID: 123
Description: Redis caching addon
`,
    `$ xano addon get 123 -w 40 -o json
{
  "id": 123,
  "name": "redis_cache",
  "description": "Redis caching addon"
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(AddonGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const addon = await client.getAddon(workspaceId, args.addon_id) as Addon

      if (flags.output === 'json') {
        this.log(JSON.stringify(addon, null, 2))
      } else {
        this.log(`Addon: ${addon.name}`)
        this.log(`ID: ${addon.id}`)
        if (addon.description) {
          this.log(`Description: ${addon.description}`)
        }
        if (addon.guid) {
          this.log(`GUID: ${addon.guid}`)
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
