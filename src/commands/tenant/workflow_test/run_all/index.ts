import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'
import {createOrderedEmitter, mapWithConcurrency} from '../../../../utils/concurrency.js'
import {collectAllPages, INTERNAL_PAGE_SIZE, normalizeListResponse} from '../../../../utils/paging.js'

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

export default class TenantWorkflowTestRunAll extends BaseCommand {
  static description = 'Run all workflow tests for a tenant'
  static examples = [
    `$ xano tenant workflow-test run-all -t my-tenant
Running 3 workflow tests...

PASS  my-test (0.25s)
FAIL  data-check (0.10s)
      Error: assertion failed

Results: 2 passed, 1 failed
`,
    `$ xano tenant workflow-test run-all -t my-tenant -o json`,
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
    const {flags} = await this.parse(TenantWorkflowTestRunAll)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = encodeURIComponent(flags.tenant)

    const baseUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/workflow_test`

    try {
      // Page the list rather than asking for everything at once: 100 per
      // request is plenty for typical suites and does not make the instance
      // build one enormous response. Termination is the server's own nextPage,
      // never "the page came back full".
      const branchValue = flags.branch
      const tests = await collectAllPages<WorkflowTest>(
        async (page) => {
          const listParams = new URLSearchParams()
          listParams.set('page', String(page))
          listParams.set('per_page', String(INTERNAL_PAGE_SIZE))
        if (branchValue) listParams.set('branch', branchValue)

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
            this.error(
              `Failed to list workflow tests: ${listResponse.status}: ${listResponse.statusText}\n${errorText}`,
            )
          }

          return normalizeListResponse<WorkflowTest>(await listResponse.json())
        },
        {
          onTruncate: (collected) => {
            this.warn(`Stopped after ${collected} workflow tests — the list did not terminate. Some tests may not have run.`)
          },
        },
      )

      if (tests.length === 0) {
        // An empty suite is a normal state (fresh branches have no tests) and
        // is a success, not a failure. Under -o json it must still be parseable,
        // with the same keys the populated path emits below.
        if (flags.output === 'json') {
          this.log(JSON.stringify({failed: 0, passed: 0, results: []}, null, 2))
        } else {
          this.log('No workflow tests found')
        }

        return
      }

      if (flags.output === 'summary') {
        this.log(`Running ${tests.length} workflow test${tests.length === 1 ? '' : 's'}...\n`)
      }

      const results: TestResult[] = []

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
              results.push({
                message: `API error ${runResponse.status}: ${errorText}`,
                name: test.name,
                status: 'fail',
              })

              if (flags.output === 'summary') {
                log(`FAIL  ${test.name}`)
                log(`      Error: API error ${runResponse.status}`)
              }

              return {lines, results}
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
                log(`PASS  ${test.name}${timing}`)
              } else {
                log(`FAIL  ${test.name}${timing}`)
                if (runResult.message) {
                  log(`      Error: ${runResult.message}`)
                }
              }
            }
          } catch (error) {
            if (error instanceof Error && 'oclif' in error) throw error
            const message = error instanceof Error ? error.message : String(error)
            results.push({
              message,
              name: test.name,
              status: 'fail',
            })

            if (flags.output === 'summary') {
              log(`FAIL  ${test.name}`)
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
      if (error instanceof Error && 'oclif' in error) throw error
      if (error instanceof Error) {
        this.error(`Failed to run workflow tests: ${error.message}`)
      } else {
        this.error(`Failed to run workflow tests: ${String(error)}`)
      }
    }
  }
}
