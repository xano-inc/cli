import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Table} from '../../../lib/types.js'

export default class TableGet extends BaseCommand {
  static override description = 'Get details of a specific database table'

  static override examples = [
    `$ xano table get 123 -w 40
Table: users (ID: 123)
Description: User accounts table
Created: 2023-04-19 21:01:32+0000
`,
    `$ xano table get 123 -o json
{
  "id": 123,
  "name": "users",
  ...
}
`,
    `$ xano table get 123 -o xs
table users {
  schema {
    int id
    text name
  }
}
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
      options: ['summary', 'json', 'xs'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TableGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const includeXanoscript = flags.output === 'xs'
      const table = await client.getTable(workspaceId, args.table_id, includeXanoscript) as Table

      if (flags.output === 'json') {
        this.log(JSON.stringify(table, null, 2))
      } else if (flags.output === 'xs') {
        if (table.xanoscript?.value) {
          this.log(table.xanoscript.value)
        } else if (table.xanoscript?.status === 'error') {
          this.error(`XanoScript error: ${table.xanoscript.message}`)
        } else {
          this.error('XanoScript not available for this table')
        }
      } else {
        this.log(`Table: ${table.name} (ID: ${table.id})`)
        if (table.description) {
          this.log(`Description: ${table.description}`)
        }
        if (table.auth !== undefined) {
          this.log(`Auth Table: ${table.auth}`)
        }
        if (table.tag && table.tag.length > 0) {
          this.log(`Tags: ${table.tag.join(', ')}`)
        }
        this.log(`Created: ${table.created_at}`)
        this.log(`Updated: ${table.updated_at}`)
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
