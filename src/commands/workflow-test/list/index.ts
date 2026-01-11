import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

interface WorkflowTest {
  id: number
  name: string
  description?: string
}

export default class WorkflowTestList extends BaseCommand {
  static override description = 'List all workflow tests in a workspace'

  static override examples = [
    `$ xano workflow-test list -w 40
Available workflow tests:
  - my-test (ID: 1)
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    branch: Flags.string({char: 'b', description: 'Branch label', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(WorkflowTestList)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      const response = await client.listWorkflowTests(workspaceId, {branch: flags.branch})
      const items = (Array.isArray(response) ? response : []) as WorkflowTest[]
      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No workflow tests found')
        } else {
          this.log('Available workflow tests:')
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
