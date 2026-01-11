import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

interface FileItem {
  id: number
  name: string
  size: number
  type: string
  mime: string
  access: string
  path: string
  created_at: string
}

export default class FileList extends BaseCommand {
  static override description = 'List files in a workspace'

  static override examples = [
    `$ xano file list -w 40
Files:
  - image.png (ID: 123, 1.2 MB, public)
  - document.pdf (ID: 124, 500 KB, private)
`,
    `$ xano file list -w 40 -o json
[{"id": 123, "name": "image.png", ...}]
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
    page: Flags.integer({
      description: 'Page number',
      default: 1,
    }),
    'per-page': Flags.integer({
      description: 'Items per page',
      default: 50,
    }),
    search: Flags.string({
      char: 's',
      description: 'Search filter',
    }),
    access: Flags.string({
      description: 'Filter by access type',
      options: ['public', 'private'],
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(FileList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listFiles(workspaceId, {
        page: flags.page,
        per_page: flags['per-page'],
        search: flags.search,
      }) as {items?: FileItem[]} | FileItem[]

      // Handle paginated response
      const items = Array.isArray(response) ? response : (response?.items || []) as FileItem[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No files found')
        } else {
          this.log('Files:')
          for (const item of items) {
            this.log(`  - ${item.name} (ID: ${item.id}, ${this.formatSize(item.size)}, ${item.access})`)
          }
        }
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
