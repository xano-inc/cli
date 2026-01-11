import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class FileBulkDelete extends BaseCommand {
  static override description = 'Delete multiple files permanently (cannot be undone)'

  static override examples = [
    `$ xano file bulk-delete 123,124,125 -w 40
3 files deleted successfully!
`,
    `$ xano file bulk-delete 123,124 -w 40 --force
2 files deleted successfully!
`,
  ]

  static override args = {
    file_ids: Args.string({
      description: 'Comma-separated file IDs to delete',
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
    const {args, flags} = await this.parse(FileBulkDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const fileIds = args.file_ids.split(',').map((id: string) => id.trim())
      await client.bulkDeleteFiles(workspaceId, fileIds)
      this.log(`${fileIds.length} files deleted successfully!`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
