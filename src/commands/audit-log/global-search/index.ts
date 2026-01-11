import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

interface AuditLogItem {
  id: number
  created_at: string
  action: string
  resource_type: string
  resource_id: number
  workspace_id?: number
  user_id?: number
  details?: unknown
}

export default class AuditLogGlobalSearch extends BaseCommand {
  static override description = 'Search global audit logs across all workspaces'

  static override examples = [
    `$ xano audit-log global-search --action CREATE
Global Audit Logs:
  - [2024-01-01] CREATE workspace (ID: 40)
`,
    `$ xano audit-log global-search --workspace-id 40 -o json
[{"id": 1, "action": "CREATE", ...}]
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    action: Flags.string({
      description: 'Filter by action type',
    }),
    'resource-type': Flags.string({
      description: 'Filter by resource type',
    }),
    'resource-id': Flags.integer({
      description: 'Filter by resource ID',
    }),
    'workspace-id': Flags.integer({
      description: 'Filter by workspace ID',
    }),
    'user-id': Flags.integer({
      description: 'Filter by user ID',
    }),
    'start-date': Flags.string({
      description: 'Filter from date (YYYY-MM-DD)',
    }),
    'end-date': Flags.string({
      description: 'Filter to date (YYYY-MM-DD)',
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
    const {flags} = await this.parse(AuditLogGlobalSearch)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)

      const searchParams: Record<string, unknown> = {}
      if (flags.action) searchParams.action = flags.action
      if (flags['resource-type']) searchParams.resource_type = flags['resource-type']
      if (flags['resource-id']) searchParams.resource_id = flags['resource-id']
      if (flags['workspace-id']) searchParams.workspace_id = flags['workspace-id']
      if (flags['user-id']) searchParams.user_id = flags['user-id']
      if (flags['start-date']) searchParams.start_date = flags['start-date']
      if (flags['end-date']) searchParams.end_date = flags['end-date']

      const response = await client.searchGlobalAuditLogs(searchParams) as {items?: AuditLogItem[]} | AuditLogItem[]

      // Handle paginated response
      const items = Array.isArray(response) ? response : (response?.items || []) as AuditLogItem[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No global audit logs found')
        } else {
          this.log('Global Audit Logs:')
          for (const item of items) {
            const date = item.created_at.split(' ')[0]
            const workspace = item.workspace_id ? ` (workspace: ${item.workspace_id})` : ''
            this.log(`  - [${date}] ${item.action} ${item.resource_type} (ID: ${item.resource_id})${workspace}`)
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
