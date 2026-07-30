import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'
import {buildPagingParams, formatPagingFooter, normalizeListResponse, pagingFlags} from '../../../../utils/paging.js'

interface UnitTest {
  description?: string
  expect_count?: number
  id: string
  input_count?: number
  name: string
  obj_id: number
  obj_name: string
  obj_type: string
}

export default class SandboxUnitTestList extends BaseCommand {
  static description = 'List all unit tests for a sandbox environment'
  static examples = [
    `$ xano sandbox unit-test list
Unit tests:
  - my-test (ID: abc-123) [function: math]
`,
    `$ xano sandbox unit-test list -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Filter by branch name',
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
    // Defaults to 10000 to preserve the previous fetch-everything behavior.
    ...pagingFlags('envelope', {defaultPerPage: 10_000, maxPerPage: 10_000}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxUnitTestList)
    const {profile} = this.resolveProfile(flags)

    const params = new URLSearchParams(buildPagingParams(flags, 'envelope'))
    if (flags.branch) params.set('branch', flags.branch)
    if (flags['obj-type']) params.set('obj_type', flags['obj-type'])

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/unit_test?${params}`

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
        const message = await this.parseApiError(response, 'API request failed')
        this.error(message)
      }

      const list = normalizeListResponse<UnitTest>(await response.json())
      const tests = list.items

      if (flags.output === 'json') {
        this.log(JSON.stringify(tests, null, 2))
      } else {
        if (tests.length === 0) {
          this.log('No unit tests found')
        } else {
          this.log(`Unit tests for sandbox environment:`)
          for (const test of tests) {
            this.log(`  - ${test.name} (ID: ${test.id}) [${test.obj_type}: ${test.obj_name}]`)
          }
        }

        const footer = formatPagingFooter(list, {noun: 'unit test', page: flags.page, tier: 'envelope'})
        if (footer) this.log(footer)
      }
    } catch (error) {
      if (error instanceof Error && 'oclif' in error) throw error
      if (error instanceof Error) {
        this.error(`Failed to list unit tests: ${error.message}`)
      } else {
        this.error(`Failed to list unit tests: ${String(error)}`)
      }
    }
  }
}
