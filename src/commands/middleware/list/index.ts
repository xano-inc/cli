import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Middleware} from '../../../lib/types.js'

export default class MiddlewareList extends BaseCommand {
  static override description = 'List all middleware in a workspace'

  static override examples = [
    `$ xano middleware list -w 40
Available middleware:
  - auth_check (ID: 1)
  - rate_limiter (ID: 2)
`,
    `$ xano middleware list -w 40 -o json
[
  {
    "id": 1,
    "name": "auth_check"
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
    include_xanoscript: Flags.boolean({
      description: 'Include XanoScript in response',
      required: false,
      default: false,
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
    const {flags} = await this.parse(MiddlewareList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listMiddleware(workspaceId, {
        page: flags.page,
        per_page: flags.per_page,
        search: flags.search,
        include_xanoscript: flags.include_xanoscript,
      })

      const items = (Array.isArray(response) ? response : response.items) as Middleware[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No middleware found')
        } else {
          this.log('Available middleware:')
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
