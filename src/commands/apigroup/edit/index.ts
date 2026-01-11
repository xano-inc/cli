import {Args, Flags} from '@oclif/core'
import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {ApiGroup} from '../../../lib/types.js'

export default class ApiGroupEdit extends BaseCommand {
  static override description = 'Edit an API group'

  static override examples = [
    `$ xano apigroup edit 123 -w 40
# Opens API group XanoScript in $EDITOR
API group updated successfully!
`,
    `$ xano apigroup edit 123 -w 40 -f updated-apigroup.xs
API group updated successfully!
`,
    `$ xano apigroup edit 123 -w 40 --name "new_name" --description "New description"
API group updated successfully!
`,
  ]

  static override args = {
    apigroup_id: Args.string({
      description: 'API Group ID',
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
      description: 'New API group name',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'New API group description',
      required: false,
    }),
    swagger: Flags.boolean({
      description: 'Enable/disable Swagger documentation',
      required: false,
      allowNo: true,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to file containing API group definition (XanoScript .xs or JSON .json)',
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
    const {args, flags} = await this.parse(ApiGroupEdit)

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
      } else if (flags.name || flags.description !== undefined || flags.swagger !== undefined) {
        // Update from flags - fetch existing API group first to preserve required fields
        const existingApiGroup = await client.getApiGroup(workspaceId, args.apigroup_id) as ApiGroup
        const updateData: Record<string, unknown> = {
          name: flags.name || existingApiGroup.name,
          description: flags.description !== undefined ? flags.description : existingApiGroup.description,
          swagger: flags.swagger !== undefined ? flags.swagger : existingApiGroup.swagger,
          tag: existingApiGroup.tag || [],
        }
        data = updateData
      } else {
        // Open in editor
        const existingApiGroup = await client.getApiGroup(workspaceId, args.apigroup_id, true) as ApiGroup

        if (!existingApiGroup.xanoscript?.value) {
          this.error('Could not retrieve XanoScript for this API group')
        }

        const editedContent = await this.openInEditor(existingApiGroup.xanoscript.value, '.xs')
        data = editedContent
        useXanoscript = true
      }

      const result = await client.updateApiGroup(workspaceId, args.apigroup_id, data, useXanoscript) as ApiGroup

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('API group updated successfully!')
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
    const tmpFile = path.join(os.tmpdir(), `xano-apigroup-edit-${Date.now()}${ext}`)
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
