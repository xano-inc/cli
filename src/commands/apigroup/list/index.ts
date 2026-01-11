import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {ApiGroup} from '../../../lib/types.js'

export default class ApiGroupList extends BaseCommand {
  static override description = 'List all API groups in a workspace'

  static override examples = [
    `$ xano apigroup list -w 40
Available API groups:
  - user (ID: 1, canonical: api:user)
  - auth (ID: 2, canonical: api:auth)
`,
    `$ xano apigroup list -w 40 -o json
[
  {
    "id": 1,
    "name": "user",
    "canonical": "user"
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
    branch: Flags.string({
      char: 'b',
      description: 'Filter by branch',
      required: false,
      default: '',
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
    const {flags} = await this.parse(ApiGroupList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listApiGroups(workspaceId, {
        page: flags.page,
        per_page: flags.per_page,
        search: flags.search,
        sort: flags.sort,
        order: flags.order,
        branch: flags.branch,
        include_xanoscript: flags.include_xanoscript,
      })

      const apiGroups = response.items as ApiGroup[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(apiGroups, null, 2))
      } else {
        if (apiGroups.length === 0) {
          this.log('No API groups found')
        } else {
          this.log('Available API groups:')
          for (const group of apiGroups) {
            this.log(`  - ${group.name} (ID: ${group.id}, canonical: api:${group.canonical})`)
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
