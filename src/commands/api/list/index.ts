import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Api} from '../../../lib/types.js'

export default class ApiList extends BaseCommand {
  static override description = 'List all API endpoints in an API group'

  static override examples = [
    `$ xano api list 5 -w 40
Available APIs in group 5:
  - GET /user (ID: 1)
  - POST /user (ID: 2)
  - DELETE /user/{id} (ID: 3)
`,
    `$ xano api list 5 -w 40 -o json
[
  {
    "id": 1,
    "name": "user",
    "verb": "GET"
  }
]
`,
  ]

  static override args = {
    apigroup_id: Args.string({
      description: 'API Group ID',
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
    include_draft: Flags.boolean({
      description: 'Include draft APIs',
      required: false,
      default: false,
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
    sort: Flags.string({
      description: 'Sort field',
      required: false,
      default: 'created_at',
      options: ['created_at', 'updated_at', 'name'],
    }),
    order: Flags.string({
      description: 'Sort order',
      required: false,
      default: 'desc',
      options: ['asc', 'desc'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ApiList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listApis(workspaceId, args.apigroup_id, {
        page: flags.page,
        per_page: flags.per_page,
        search: flags.search,
        sort: flags.sort,
        order: flags.order,
        include_draft: flags.include_draft,
        include_xanoscript: flags.include_xanoscript,
      })

      const apis = response.items as Api[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(apis, null, 2))
      } else {
        if (apis.length === 0) {
          this.log('No APIs found')
        } else {
          this.log(`Available APIs in group ${args.apigroup_id}:`)
          for (const api of apis) {
            this.log(`  - ${api.verb} /${api.name} (ID: ${api.id})`)
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
