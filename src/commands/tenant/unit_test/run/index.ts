import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface RunResult {
  message?: string
  results?: Array<{message?: string; status: string}>
  status: string
}

export default class TenantUnitTestRun extends BaseCommand {
  static override args = {
    unit_test_id: Args.string({
      description: 'ID of the unit test to run',
      required: true,
    }),
  }
  static description = 'Run a unit test for a tenant'
  static examples = [
    `$ xano tenant unit-test run abc-123 -t my-tenant
Running unit test abc-123...
Result: PASS
`,
    `$ xano tenant unit-test run abc-123 -t my-tenant -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch the unit test belongs to (uses profile branch if not provided, then the live branch)',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    tenant: Flags.string({
      char: 't',
      description: 'Tenant name',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantUnitTestRun)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = encodeURIComponent(flags.tenant)
    const branch = flags.branch ?? profile.branch

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/unit_test/${encodeURIComponent(args.unit_test_id)}/run`

    try {
      if (flags.output === 'summary') {
        this.log(`Running unit test ${args.unit_test_id}...`)
      }

      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(branch ? {branch} : {}),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const result = (await response.json()) as RunResult

      // Anything other than 'ok' is a failure -- the API has been observed
      // returning several distinct non-ok statuses, so never enumerate them.
      const passed = result.status === 'ok'

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else if (passed) {
        this.log('Result: PASS')
      } else {
        this.log('Result: FAIL')
        const failedExpects = result.results?.filter((r) => r.status === 'fail') ?? []
        for (const expect of failedExpects) {
          if (expect.message) {
            this.log(`  Error: ${expect.message}`)
          }
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
        this.error(`Failed to run unit test: ${error.message}`)
      } else {
        this.error(`Failed to run unit test: ${String(error)}`)
      }
    }
  }
}
