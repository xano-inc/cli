import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class FileDelete extends BaseCommand {
  static override description = 'Delete a file permanently (cannot be undone)'

  static override examples = [
    `$ xano file delete 123 -w 40
File deleted successfully!
`,
    `$ xano file delete 123 -w 40 --force
File deleted successfully!
`,
  ]

  static override args = {
    file_id: Args.string({
      description: 'File ID to delete',
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
    force: Flags.boolean({
      char: 'f',
      description: 'Skip confirmation prompt',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FileDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      await client.deleteFile(workspaceId, args.file_id)
      this.log('File deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
