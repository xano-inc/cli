import {Args, Flags} from '@oclif/core'
import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Table} from '../../../lib/types.js'

export default class TableEdit extends BaseCommand {
  static override description = 'Edit a database table'

  static override examples = [
    `$ xano table edit 123 -w 40
# Opens table XanoScript in $EDITOR
Table updated successfully!
`,
    `$ xano table edit 123 -w 40 -f updated-table.xs
Table updated successfully!
`,
    `$ xano table edit 123 -w 40 --name "new_name"
Table updated successfully!
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
    name: Flags.string({
      char: 'n',
      description: 'New table name',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'New table description',
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
    const {args, flags} = await this.parse(TableEdit)

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
      } else if (flags.name || flags.description !== undefined) {
        // Update from flags - fetch existing table first to preserve required fields
        const existingTable = await client.getTable(workspaceId, args.table_id) as Table
        const updateData: Record<string, unknown> = {
          name: flags.name || existingTable.name,
          description: flags.description !== undefined ? flags.description : existingTable.description,
          tag: existingTable.tag || [],
        }
        data = updateData
      } else {
        // Open in editor
        const existingTable = await client.getTable(workspaceId, args.table_id, true) as Table

        if (!existingTable.xanoscript?.value) {
          this.error('Could not retrieve XanoScript for this table')
        }

        const editedContent = await this.openInEditor(existingTable.xanoscript.value, '.xs')
        data = editedContent
        useXanoscript = true
      }

      const result = await client.updateTable(workspaceId, args.table_id, data, useXanoscript) as Table

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('Table updated successfully!')
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

  private async openInEditor(content: string, ext: string): Promise<string> {
    const editor = process.env.EDITOR || process.env.VISUAL

    if (!editor) {
      this.error(
        'No editor configured. Please set the EDITOR or VISUAL environment variable.\n' +
        'Example: export EDITOR=vim',
      )
    }

    // Create temp file
    const tmpFile = path.join(os.tmpdir(), `xano-table-edit-${Date.now()}${ext}`)
    fs.writeFileSync(tmpFile, content, 'utf8')

    try {
      execSync(`${editor} ${tmpFile}`, {stdio: 'inherit'})
      const editedContent = fs.readFileSync(tmpFile, 'utf8')
      return editedContent
    } finally {
      try {
        fs.unlinkSync(tmpFile)
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}
