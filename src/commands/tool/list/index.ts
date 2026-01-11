import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

interface Tool {
  id: number
  name: string
  description?: string
}

export default class ToolList extends BaseCommand {
  static override description = 'List all tools in a workspace'

  static override examples = [
    `$ xano tool list -w 40
Available tools:
  - my-tool (ID: 1)
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    branch: Flags.string({char: 'b', description: 'Branch label', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ToolList)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      const response = await client.listTools(workspaceId, {branch: flags.branch}) as {items?: Tool[]} | Tool[]
      // Handle both paginated response {items: [...]} and direct array
      const items = Array.isArray(response) ? response : (response?.items || []) as Tool[]
      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No tools found')
        } else {
          this.log('Available tools:')
          for (const item of items) {
            this.log(`  - ${item.name} (ID: ${item.id})`)
          }
        }
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
