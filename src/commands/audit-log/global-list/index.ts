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

export default class AuditLogGlobalList extends BaseCommand {
  static override description = 'List global audit logs across all workspaces'

  static override examples = [
    `$ xano audit-log global-list
Global Audit Logs:
  - [2024-01-01] CREATE workspace (ID: 40)
`,
    `$ xano audit-log global-list -o json
[{"id": 1, "action": "CREATE", ...}]
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    page: Flags.integer({
      description: 'Page number',
      default: 1,
    }),
    'per-page': Flags.integer({
      description: 'Items per page',
      default: 50,
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
    const {flags} = await this.parse(AuditLogGlobalList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)

      const response = await client.listGlobalAuditLogs({
        page: flags.page,
        per_page: flags['per-page'],
      }) as {items?: AuditLogItem[]} | AuditLogItem[]

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
