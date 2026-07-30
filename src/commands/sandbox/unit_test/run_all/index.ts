import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'
import {createOrderedEmitter, mapWithConcurrency} from '../../../../utils/concurrency.js'
import {collectAllPages, INTERNAL_PAGE_SIZE, normalizeListResponse} from '../../../../utils/paging.js'

interface UnitTest {
  id: string
  name: string
  obj_name: string
  obj_type: string
}

interface RunResult {
  message?: string
  results?: Array<{message?: string; status: string}>
  status: string
}

interface TestResult {
  message?: string
  name: string
  obj_name: string
  obj_type: string
  status: 'fail' | 'pass'
}

export default class SandboxUnitTestRunAll extends BaseCommand {
  static description = 'Run all unit tests for a sandbox environment'
  static examples = [
    `$ xano sandbox unit-test run-all
Running 5 unit tests...

PASS  my-test [function: math]
FAIL  data-validation [function: validate]
      Error: assertion failed

Results: 4 passed, 1 failed
`,
    `$ xano sandbox unit-test run-all -o json`,
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
    'obj-type': Flags.string({
      description: 'Filter by object type',
      options: ['function', 'query', 'middleware'],
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
    const {flags} = await this.parse(SandboxUnitTestRunAll)
    const {profile} = this.resolveProfile(flags)

    const baseUrl = `${profile.instance_origin}/api:meta/sandbox/unit_test`

    try {
      // Step 1: List all unit tests
      // Page the list rather than asking for everything at once: 100 per
      // request is plenty for typical suites and does not make the instance
      // build one enormous response. Termination is the server's own nextPage,
      // never "the page came back full".
      const branchValue = flags.branch
      const tests = await collectAllPages<UnitTest>(
        async (page) => {
          const listParams = new URLSearchParams()
          listParams.set('page', String(page))
          listParams.set('per_page', String(INTERNAL_PAGE_SIZE))
        if (branchValue) listParams.set('branch', branchValue)
        if (flags['obj-type']) listParams.set('obj_type', flags['obj-type'])

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
              `Failed to list unit tests: ${listResponse.status}: ${listResponse.statusText}\n${errorText}`,
            )
          }

          return normalizeListResponse<UnitTest>(await listResponse.json())
        },
        {
          onTruncate: (collected) => {
            this.warn(`Stopped after ${collected} unit tests — the list did not terminate. Some tests may not have run.`)
          },
        },
      )

      if (tests.length === 0) {
        this.log('No unit tests found')
        return
      }

      if (flags.output === 'summary') {
        this.log(`Running ${tests.length} unit test${tests.length === 1 ? '' : 's'}...\n`)
      }

      // Step 2: Run each test
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
                obj_name: test.obj_name,
                obj_type: test.obj_type,
                status: 'fail',
              })

              if (flags.output === 'summary') {
                log(`FAIL  ${test.name} [${test.obj_type}: ${test.obj_name}]`)
                log(`      Error: API error ${runResponse.status}`)
              }

              return {lines, results}
            }

            const runResult = (await runResponse.json()) as RunResult
            const passed = runResult.status === 'ok'
            const failedExpects = runResult.results?.filter((r) => r.status === 'fail') ?? []
            results.push({
              message: failedExpects[0]?.message,
              name: test.name,
              obj_name: test.obj_name,
              obj_type: test.obj_type,
              status: passed ? 'pass' : 'fail',
            })

            if (flags.output === 'summary') {
              if (passed) {
                log(`PASS  ${test.name} [${test.obj_type}: ${test.obj_name}]`)
              } else {
                log(`FAIL  ${test.name} [${test.obj_type}: ${test.obj_name}]`)
                for (const expect of failedExpects) {
                  if (expect.message) {
                    log(`      Error: ${expect.message}`)
                  }
                }
              }
            }
          } catch (error) {
        if (error instanceof Error && 'oclif' in error) throw error
            const message = error instanceof Error ? error.message : String(error)
            results.push({
              message,
              name: test.name,
              obj_name: test.obj_name,
              obj_type: test.obj_type,
              status: 'fail',
            })

            if (flags.output === 'summary') {
              log(`FAIL  ${test.name} [${test.obj_type}: ${test.obj_name}]`)
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
        this.error(`Failed to run unit tests: ${error.message}`)
      } else {
        this.error(`Failed to run unit tests: ${String(error)}`)
      }
    }
  }
}
