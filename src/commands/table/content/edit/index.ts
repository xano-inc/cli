import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableContentEdit extends BaseCommand {
  static override description = 'Update an existing record in a table'

  static override examples = [
    `$ xano table content edit 123 456 -w 40 --data '{"name": "updated"}'
Record updated successfully!
ID: 456
`,
    `$ xano table content edit 123 456 -w 40 -f record.json -o json
{"id": 456, "name": "updated", ...}
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
    data: Flags.string({
      char: 'd',
      description: 'Record data as JSON string',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to JSON file with record data',
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
    const {args, flags} = await this.parse(TableContentEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let data: unknown

      if (flags.file) {
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }
        const content = fs.readFileSync(flags.file, 'utf8')
        data = JSON.parse(content)
      } else if (flags.data) {
        data = JSON.parse(flags.data)
      } else {
        this.error('Either --data or --file must be provided')
      }

      const record = await client.updateTableContent(workspaceId, args.table_id, args.record_id, data) as {id: number}

      if (flags.output === 'json') {
        this.log(JSON.stringify(record, null, 2))
      } else {
        this.log('Record updated successfully!')
        this.log(`ID: ${record.id}`)
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
