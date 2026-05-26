import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface RunResult {
  message?: string
  status: string
  timing: number
}

export default class WorkflowTestRun extends BaseCommand {
  static override args = {
    workflow_test_id: Args.integer({
      description: 'ID of the workflow test to run',
      required: true,
    }),
  }
  static description = 'Run a workflow test'
  static examples = [
    `$ xano workflow-test run 1
Running workflow test 1...
Result: PASS (1.234s)
`,
    `$ xano workflow-test run 1 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
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
    const {args, flags} = await this.parse(WorkflowTestRun)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/workflow_test/${args.workflow_test_id}/run`

    try {
      if (flags.output === 'summary') {
        this.log(`Running workflow test ${args.workflow_test_id}...`)
      }

      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
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

      const result = await response.json() as RunResult

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        const timing = `(${result.timing.toFixed(3)}s)`
        if (result.status === 'ok') {
          this.log(`Result: PASS ${timing}`)
        } else {
          this.log(`Result: FAIL ${timing}`)
          if (result.message) {
            this.log(`  Error: ${result.message}`)
          }

          this.exit(1)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to run workflow test: ${error.message}`)
      } else {
        this.error(`Failed to run workflow test: ${String(error)}`)
      }
    }
  }
}
