import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

export default class TableIndexReplace extends BaseCommand {
  static override description = 'Replace all indexes on a table'

  static override examples = [
    `$ xano table index replace 123 -w 40 -f indexes.json
Indexes replaced successfully!
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
    data: Flags.string({
      char: 'd',
      description: 'Indexes as JSON string',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to JSON file with indexes',
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
    const {args, flags} = await this.parse(TableIndexReplace)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let indexes: unknown

      if (flags.file) {
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }
        const content = fs.readFileSync(flags.file, 'utf8')
        indexes = JSON.parse(content)
      } else if (flags.data) {
        indexes = JSON.parse(flags.data)
      } else {
        this.error('Either --data or --file must be provided')
      }

      const result = await client.replaceTableIndexes(workspaceId, args.table_id, indexes)

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('Indexes replaced successfully!')
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
