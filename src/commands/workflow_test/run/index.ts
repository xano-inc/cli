import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface RunResult {
  message?: string
  status: string
  // Optional: a failing run can come back without timing. Calling .toFixed()
  // on an absent value would throw into the catch and exit 2 instead of 1.
  timing?: number
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

      // Anything other than 'ok' is a failure -- the API has been observed
      // returning several distinct non-ok statuses, so never enumerate them.
      const passed = result.status === 'ok'

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        const timing = typeof result.timing === 'number' ? ` (${result.timing.toFixed(3)}s)` : ''
        this.log(`Result: ${passed ? 'PASS' : 'FAIL'}${timing}`)
        if (!passed && result.message) {
          this.log(`  Error: ${result.message}`)
        }
      }

      // Set the code rather than throwing via this.exit(): the exit must apply
      // in both output modes, and process.exitCode cannot be swallowed by the
      // surrounding catch. Mirrors what run_all already does.
      if (!passed) {
        process.exitCode = 1
      }
    } catch (error) {
      if (error instanceof Error && 'oclif' in error) throw error
      if (error instanceof Error) {
        this.error(`Failed to run workflow test: ${error.message}`)
      } else {
        this.error(`Failed to run workflow test: ${String(error)}`)
      }
    }
  }
}
