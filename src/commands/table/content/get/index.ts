import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableContentGet extends BaseCommand {
  static override description = 'Get a specific record from a table'

  static override examples = [
    `$ xano table content get 123 456 -w 40
Record ID: 456
{"id": 456, "name": "example", ...}
`,
    `$ xano table content get 123 456 -w 40 -o json
{"id": 456, "name": "example", ...}
`,
  ]

  static override args = {
    table_id: Args.string({
      description: 'Table ID',
      required: true,
    }),
    record_id: Args.string({
      description: 'Record ID',
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
    const {args, flags} = await this.parse(TableContentGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const record = await client.getTableContent(workspaceId, args.table_id, args.record_id) as {id: number}

      if (flags.output === 'json') {
        this.log(JSON.stringify(record, null, 2))
      } else {
        this.log(`Record ID: ${record.id}`)
        this.log(JSON.stringify(record, null, 2))
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
