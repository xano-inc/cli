import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface WorkflowTest {
  id: number
  name: string
}

interface RunResult {
  message?: string
  status: string
  timing?: number
}

interface TestResult {
  message?: string
  name: string
  status: 'fail' | 'pass'
  timing?: number
}

export default class SandboxWorkflowTestRunAll extends BaseCommand {
  static description = 'Run all workflow tests for a sandbox environment'
  static examples = [
    `$ xano sandbox workflow-test run-all
Running 3 workflow tests...

PASS  my-test (0.25s)
FAIL  data-check (0.10s)
      Error: assertion failed

Results: 2 passed, 1 failed
`,
    `$ xano sandbox workflow-test run-all -o json`,
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
    const {flags} = await this.parse(SandboxWorkflowTestRunAll)
    const {profile} = this.resolveProfile(flags)

    const tenant = await this.getOrCreateSandbox(profile, flags.verbose)
    const tenantName = tenant.name

    const baseUrl = `${profile.instance_origin}/api:meta/sandbox/tenant/${encodeURIComponent(tenantName)}/workflow_test`

    try {
      // Step 1: List all workflow tests
      const listParams = new URLSearchParams()
      listParams.set('per_page', '10000')
      if (flags.branch) listParams.set('branch', flags.branch)

      const listResponse = await this.verboseFetch(
        `${baseUrl}?${listParams}`,
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

      if (!listResponse.ok) {
        const errorText = await listResponse.text()
        this.error(`Failed to list workflow tests: ${listResponse.status}: ${listResponse.statusText}\n${errorText}`)
      }

      const data = (await listResponse.json()) as WorkflowTest[] | {items?: WorkflowTest[]}

      let tests: WorkflowTest[]
      if (Array.isArray(data)) {
        tests = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        tests = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (tests.length === 0) {
        this.log('No workflow tests found')
        return
      }

      if (flags.output === 'summary') {
        this.log(`Running ${tests.length} workflow test${tests.length === 1 ? '' : 's'}...\n`)
      }

      // Step 2: Run each test
      const results: TestResult[] = []

      for (const test of tests) {
        const runUrl = `${baseUrl}/${test.id}/run`

        try {
          const runResponse = await this.verboseFetch(
            runUrl,
            {
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

          if (!runResponse.ok) {
            const errorText = await runResponse.text()
            results.push({
              message: `API error ${runResponse.status}: ${errorText}`,
              name: test.name,
              status: 'fail',
            })

            if (flags.output === 'summary') {
              this.log(`FAIL  ${test.name}`)
              this.log(`      Error: API error ${runResponse.status}`)
            }

            continue
          }

          const runResult = (await runResponse.json()) as RunResult
          const passed = runResult.status === 'ok'
          results.push({
            message: runResult.message,
            name: test.name,
            status: passed ? 'pass' : 'fail',
            timing: runResult.timing,
          })

          if (flags.output === 'summary') {
            const timing = runResult.timing ? ` (${runResult.timing}s)` : ''
            if (passed) {
              this.log(`PASS  ${test.name}${timing}`)
            } else {
              this.log(`FAIL  ${test.name}${timing}`)
              if (runResult.message) {
                this.log(`      Error: ${runResult.message}`)
              }
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          results.push({
            message,
            name: test.name,
            status: 'fail',
          })

          if (flags.output === 'summary') {
            this.log(`FAIL  ${test.name}`)
            this.log(`      Error: ${message}`)
          }
        }
      }

      // Step 3: Summary
      const passed = results.filter((r) => r.status === 'pass').length
      const failed = results.filter((r) => r.status === 'fail').length

      if (flags.output === 'json') {
        this.log(JSON.stringify({failed, passed, results}, null, 2))
      } else {
        this.log(`\nResults: ${passed} passed, ${failed} failed`)
      }

      if (failed > 0) {
        process.exitCode = 1
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to run workflow tests: ${error.message}`)
      } else {
        this.error(`Failed to run workflow tests: ${String(error)}`)
      }
    }
  }
}
