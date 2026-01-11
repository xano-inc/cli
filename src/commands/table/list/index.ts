import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Table} from '../../../lib/types.js'

export default class TableList extends BaseCommand {
  static override description = 'List all database tables in a workspace'

  static override examples = [
    `$ xano table list -w 40
Available tables:
  - users (ID: 1)
  - posts (ID: 2)
  - comments (ID: 3)
`,
    `$ xano table list --profile production
Available tables:
  - customers (ID: 1)
  - orders (ID: 2)
`,
    `$ xano table list -w 40 -o json
[
  {
    "id": 1,
    "name": "users"
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
    sort: Flags.string({
      description: 'Sort field',
      required: false,
      default: 'name',
      options: ['created_at', 'updated_at', 'name'],
    }),
    order: Flags.string({
      description: 'Sort order',
      required: false,
      default: 'asc',
      options: ['asc', 'desc'],
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TableList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listTables(workspaceId, {
        page: flags.page,
        per_page: flags.per_page,
        search: flags.search,
        sort: flags.sort,
        order: flags.order,
        include_xanoscript: flags.include_xanoscript,
      })

      // Handle different response formats
      let tables: Table[]
      if (Array.isArray(response)) {
        // Check if it's a paginated response wrapped in array
        if (response.length > 0 && 'items' in (response[0] as Record<string, unknown>)) {
          tables = (response[0] as {items: Table[]}).items
        } else {
          tables = response as Table[]
        }
      } else if (response && typeof response === 'object' && 'items' in response) {
        tables = response.items as Table[]
      } else {
        tables = []
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(tables, null, 2))
      } else {
        if (tables.length === 0) {
          this.log('No tables found')
        } else {
          this.log('Available tables:')
          for (const table of tables) {
            this.log(`  - ${table.name} (ID: ${table.id})`)
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
