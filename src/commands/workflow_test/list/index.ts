import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface WorkflowTest {
  created_at?: string
  description?: string
  id: number
  name: string
  updated_at?: string
}

export default class WorkflowTestList extends BaseCommand {
  static description = 'List all workflow tests in a workspace'
  static examples = [
    `$ xano workflow-test list
Workflow tests in workspace 5:
  - my-test (ID: 1)
  - auth-flow (ID: 2) - Validates auth endpoints
`,
    `$ xano workflow-test list -w 5 --output json`,
    `$ xano workflow-test list --branch main`,
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(WorkflowTestList)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const params = new URLSearchParams({include_xanoscript: 'false'})
    if (flags.branch) {
      params.set('branch', flags.branch)
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/workflow_test?${params}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const data = await response.json() as WorkflowTest[] | {items?: WorkflowTest[]}

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
          this.log(`Workflow tests in workspace ${workspaceId}:`)
          for (const test of tests) {
            const desc = test.description ? ` - ${test.description}` : ''
            this.log(`  - ${test.name} (ID: ${test.id})${desc}`)
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
