import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {createOrderedEmitter, mapWithConcurrency} from '../../../utils/concurrency.js'

interface WorkflowTest {
  id: number
  name: string
}

interface RunResult {
  message?: string
  status: string
  timing: number
}

interface TestResult {
  message?: string
  name: string
  status: 'fail' | 'pass'
  timing: number
}

export default class WorkflowTestRunAll extends BaseCommand {
  static description = 'Run all workflow tests in a workspace'
  static examples = [
    `$ xano workflow-test run-all
Running 3 workflow tests...

PASS  my-test (1.234s)
PASS  auth-flow (0.567s)
FAIL  data-validation (0.890s)
      Error: assertion failed at step 3

Results: 2 passed, 1 failed (2.691s total)
`,
    `$ xano workflow-test run-all --branch main -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Filter by branch name',
      required: false,
    }),
    concurrency: Flags.integer({
      default: 1,
      description:
        'Run this many tests in parallel. Tests share the workspace database, so raise this only when your tests do not depend on shared state.',
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
    const {flags} = await this.parse(WorkflowTestRunAll)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const baseUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/workflow_test`

    try {
      // Step 1: List all workflow tests
      const listParams = new URLSearchParams({include_xanoscript: 'false'})
      if (flags.branch) {
        listParams.set('branch', flags.branch)
      }

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
      let totalTiming = 0

      const runOne = async (test: (typeof tests)[number]): Promise<{lines: string[]; results: TestResult[]}> => {
        // Shadowed accumulators: the body below is the original sequential
        // logic, but it records output instead of printing it so a concurrent
        // run can still emit in input order.
        const results: TestResult[] = []
        const lines: string[] = []
        const log = (message: string): void => {
          lines.push(message)
        }

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
              const result: TestResult = {
                message: `API error ${runResponse.status}: ${errorText}`,
                name: test.name,
                status: 'fail',
                timing: 0,
              }
              results.push(result)

              if (flags.output === 'summary') {
                log(`FAIL  ${test.name} (0.000s)`)
                log(`      Error: API error ${runResponse.status}`)
              }

              return {lines, results}
            }

            const runResult = (await runResponse.json()) as RunResult
            const passed = runResult.status === 'ok'
            const result: TestResult = {
              message: runResult.message,
              name: test.name,
              status: passed ? 'pass' : 'fail',
              timing: runResult.timing,
            }
            results.push(result)
            totalTiming += runResult.timing

            if (flags.output === 'summary') {
              const timing = `(${runResult.timing.toFixed(3)}s)`
              if (passed) {
                log(`PASS  ${test.name} ${timing}`)
              } else {
                log(`FAIL  ${test.name} ${timing}`)
                if (runResult.message) {
                  log(`      Error: ${runResult.message}`)
                }
              }
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            results.push({
              message,
              name: test.name,
              status: 'fail',
              timing: 0,
            })

            if (flags.output === 'summary') {
              log(`FAIL  ${test.name} (0.000s)`)
              log(`      Error: ${message}`)
            }
          }
      
        return {lines, results}
      }

      // Print in input order as each test settles, so concurrent output stays
      // diffable against a sequential run.
      const emitter = createOrderedEmitter<{lines: string[]; results: TestResult[]}>((settled) => {
        for (const line of settled.lines) this.log(line)
      })

      const perTest = await mapWithConcurrency(tests, flags.concurrency, async (test, index) => {
        const settled = await runOne(test)
        emitter.settle(index, settled)
        return settled
      })

      results.push(...perTest.flatMap((r) => r.results))

      // Step 3: Summary
      const passed = results.filter((r) => r.status === 'pass').length
      const failed = results.filter((r) => r.status === 'fail').length

      if (flags.output === 'json') {
        this.log(JSON.stringify({failed, passed, results, total_timing: totalTiming}, null, 2))
      } else {
        this.log(`\nResults: ${passed} passed, ${failed} failed (${totalTiming.toFixed(3)}s total)`)
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
