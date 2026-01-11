import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

interface Branch {
  label: string
  created_at: string
  live: boolean
  backup: boolean
}

export default class BranchList extends BaseCommand {
  static override description = 'List all branches in a workspace'

  static override examples = [
    `$ xano branch list -w 40
Available branches:
  - v1 (live)
  - dev
`,
    `$ xano branch list -w 40 -o json
[{"label": "v1", "live": true}]
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
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
    const {flags} = await this.parse(BranchList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const response = await client.listBranches(workspaceId)
      const items = (Array.isArray(response) ? response : []) as Branch[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No branches found')
        } else {
          this.log('Available branches:')
          for (const item of items) {
            const status = item.live ? ' (live)' : item.backup ? ' (backup)' : ''
            this.log(`  - ${item.label}${status}`)
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
