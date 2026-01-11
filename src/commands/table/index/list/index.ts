import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableIndexList extends BaseCommand {
  static override description = 'List all indexes on a table'

  static override examples = [
    `$ xano table index list 123 -w 40
Indexes on table:
  - primary_key (btree)
  - email_unique (unique)
`,
    `$ xano table index list 123 -w 40 -o json
[{"id": 1, "type": "btree", ...}]
`,
  ]

  static override args = {
    table_id: Args.string({
      description: 'Table ID',
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
    const {args, flags} = await this.parse(TableIndexList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const result = await client.listTableIndexes(workspaceId, args.table_id)
      const indexes = Array.isArray(result) ? result : []

      if (flags.output === 'json') {
        this.log(JSON.stringify(indexes, null, 2))
      } else {
        if (indexes.length === 0) {
          this.log('No indexes found')
        } else {
          this.log('Indexes on table:')
          for (const idx of indexes as Array<{id?: number; name?: string; type?: string}>) {
            const name = idx.name || `index_${idx.id}`
            const type = idx.type || 'unknown'
            this.log(`  - ${name} (${type})`)
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
