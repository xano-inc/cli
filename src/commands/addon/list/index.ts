import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Addon} from '../../../lib/types.js'

export default class AddonList extends BaseCommand {
  static override description = 'List all addons in a workspace'

  static override examples = [
    `$ xano addon list -w 40
Available addons:
  - redis_cache (ID: 1)
  - email_service (ID: 2)
`,
    `$ xano addon list -w 40 -o json
[
  {
    "id": 1,
    "name": "redis_cache"
  }
]
`,
  ]

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
    page: Flags.integer({
      description: 'Page number for pagination',
      required: false,
      default: 1,
    }),
    per_page: Flags.integer({
      description: 'Number of results per page',
      required: false,
      default: 50,
    }),
    search: Flags.string({
      description: 'Search filter',
      required: false,
      default: '',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AddonList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listAddons(workspaceId, {
        page: flags.page,
        per_page: flags.per_page,
        search: flags.search,
      })

      const items = (Array.isArray(response) ? response : response.items) as Addon[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No addons found')
        } else {
          this.log('Available addons:')
          for (const item of items) {
            this.log(`  - ${item.name} (ID: ${item.id})`)
          }
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
