import {Args, Flags} from '@oclif/core'
import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Api} from '../../../lib/types.js'

export default class ApiEdit extends BaseCommand {
  static override description = 'Edit an API endpoint'

  static override examples = [
    `$ xano api edit 5 123 -w 40
# Opens API XanoScript in $EDITOR
API updated successfully!
`,
    `$ xano api edit 5 123 -w 40 -f updated-api.xs
API updated successfully!
`,
    `$ xano api edit 5 123 -w 40 --name "new_endpoint" --verb POST
API updated successfully!
`,
    `$ xano api edit 5 123 -w 40 --publish
API updated and published!
`,
  ]

  static override args = {
    apigroup_id: Args.string({
      description: 'API Group ID',
      required: true,
    }),
    api_id: Args.string({
      description: 'API ID',
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
      description: 'New API endpoint name',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'New API endpoint description',
      required: false,
    }),
    verb: Flags.string({
      char: 'v',
      description: 'HTTP verb',
      required: false,
      options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
    }),
    publish: Flags.boolean({
      description: 'Publish after editing',
      required: false,
      default: true,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to file containing API definition (XanoScript .xs or JSON .json)',
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
    const {args, flags} = await this.parse(ApiEdit)

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
      } else if (flags.name || flags.description !== undefined || flags.verb) {
        // Update from flags - fetch existing API first to preserve required fields
        const existingApi = await client.getApi(workspaceId, args.apigroup_id, args.api_id) as Api
        const updateData: Record<string, unknown> = {
          name: flags.name || existingApi.name,
          description: flags.description !== undefined ? flags.description : existingApi.description,
          verb: flags.verb || existingApi.verb,
          tag: existingApi.tag || [],
        }
        data = updateData
      } else {
        // Open in editor
        const existingApi = await client.getApi(workspaceId, args.apigroup_id, args.api_id, {
          include_xanoscript: true,
        }) as Api

        if (!existingApi.xanoscript?.value) {
          this.error('Could not retrieve XanoScript for this API')
        }

        const editedContent = await this.openInEditor(existingApi.xanoscript.value, '.xs')
        data = editedContent
        useXanoscript = true
      }

      const result = await client.updateApi(
        workspaceId,
        args.apigroup_id,
        args.api_id,
        data,
        useXanoscript,
        flags.publish,
      ) as Api

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(flags.publish ? 'API updated and published!' : 'API updated successfully!')
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)
        this.log(`Verb: ${result.verb}`)
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
    const tmpFile = path.join(os.tmpdir(), `xano-api-edit-${Date.now()}${ext}`)
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
