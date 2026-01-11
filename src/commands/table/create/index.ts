import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Table} from '../../../lib/types.js'

export default class TableCreate extends BaseCommand {
  static override description = 'Create a new database table in a workspace'

  static override examples = [
    `$ xano table create -w 40 --name users --description "User accounts"
Table created successfully!
ID: 123
Name: users
`,
    `$ xano table create -w 40 -f table.xs
Table created successfully!
ID: 123
Name: books
`,
    `$ xano table create -w 40 -f table.json
Table created successfully!
ID: 123
Name: products
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Table name',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'Table description',
      required: false,
      default: '',
    }),
    auth: Flags.boolean({
      description: 'Mark as authentication table',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to file containing table definition (XanoScript .xs or JSON .json)',
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
    const {flags} = await this.parse(TableCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let data: unknown
      let useXanoscript = false

      if (flags.file) {
        // Read from file
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }

        const content = fs.readFileSync(flags.file, 'utf8')
        const ext = flags.file.toLowerCase()

        if (ext.endsWith('.xs')) {
          data = content
          useXanoscript = true
        } else if (ext.endsWith('.json')) {
          try {
            data = JSON.parse(content)
          } catch {
            this.error('Invalid JSON file')
          }
        } else {
          this.error('File must be .xs (XanoScript) or .json')
        }
      } else if (flags.name) {
        // Create from flags
        data = {
          name: flags.name,
          description: flags.description,
          auth: flags.auth,
        }
      } else {
        this.error('Either --name or --file must be provided')
      }

      const result = await client.createTable(workspaceId, data, useXanoscript) as Table

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('Table created successfully!')
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)
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
