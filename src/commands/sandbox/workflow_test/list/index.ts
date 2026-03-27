import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface WorkflowTest {
  description?: string
  id: number
  name: string
}

export default class SandboxWorkflowTestList extends BaseCommand {
  static description = 'List workflow tests for a sandbox environment'
  static examples = [
    `$ xano sandbox workflow-test list
Workflow tests:
  - my-test (ID: 1)
`,
    `$ xano sandbox workflow-test list -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Filter by branch name',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxWorkflowTestList)
    const {profile} = this.resolveProfile(flags)

    const params = new URLSearchParams()
    params.set('per_page', '10000')
    if (flags.branch) params.set('branch', flags.branch)

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/workflow_test?${params}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
          },
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const data = (await response.json()) as WorkflowTest[] | {items?: WorkflowTest[]}

      let tests: WorkflowTest[]
      if (Array.isArray(data)) {
        tests = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        tests = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(tests, null, 2))
      } else {
        if (tests.length === 0) {
          this.log('No workflow tests found')
        } else {
          this.log(`Workflow tests for sandbox environment:`)
          for (const test of tests) {
            this.log(`  - ${test.name} (ID: ${test.id})`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list workflow tests: ${error.message}`)
      } else {
        this.error(`Failed to list workflow tests: ${String(error)}`)
      }
    }
  }
}
