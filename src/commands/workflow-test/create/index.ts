import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class WorkflowTestCreate extends BaseCommand {
  static override description = 'Create a new workflow test'

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    name: Flags.string({description: 'Workflow test name', required: false}),
    description: Flags.string({description: 'Workflow test description', required: false}),
    data: Flags.string({char: 'd', description: 'Workflow test data as JSON', required: false}),
    file: Flags.string({char: 'f', description: 'Path to JSON file', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(WorkflowTestCreate)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      let testData: Record<string, unknown>
      if (flags.file) {
        if (!fs.existsSync(flags.file)) this.error(`File not found: ${flags.file}`)
        testData = JSON.parse(fs.readFileSync(flags.file, 'utf8'))
      } else if (flags.data) {
        testData = JSON.parse(flags.data)
      } else if (flags.name) {
        testData = {name: flags.name, description: flags.description || ''}
      } else {
        this.error('Either --name, --data, or --file must be provided')
      }
      const test = await client.createWorkflowTest(workspaceId, testData) as {id: number}
      if (flags.output === 'json') {
        this.log(JSON.stringify(test, null, 2))
      } else {
        this.log('Workflow test created successfully!')
        this.log(`ID: ${test.id}`)
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
