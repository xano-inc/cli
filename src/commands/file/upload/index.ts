import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class FileUpload extends BaseCommand {
  static override description = 'Upload a file to the workspace'

  static override examples = [
    `$ xano file upload ./image.png -w 40
File uploaded successfully!
ID: 123
Name: image.png
`,
    `$ xano file upload ./document.pdf -w 40 --access private
File uploaded successfully!
`,
  ]

  static override args = {
    file_path: Args.string({
      description: 'Path to the file to upload',
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
    access: Flags.string({
      description: 'File access type',
      options: ['public', 'private'],
      default: 'public',
    }),
    type: Flags.string({
      description: 'File type',
      options: ['image', 'video', 'audio'],
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FileUpload)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Verify file exists
      if (!fs.existsSync(args.file_path)) {
        this.error(`File not found: ${args.file_path}`)
      }

      const fileName = path.basename(args.file_path)

      // Note: File upload requires multipart form data
      // This is a simplified implementation - actual file upload would need
      // proper multipart handling in the API client
      const result = await client.uploadFile(workspaceId, args.file_path, fileName) as {
        id: number
        name: string
        size: number
        access: string
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('File uploaded successfully!')
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
