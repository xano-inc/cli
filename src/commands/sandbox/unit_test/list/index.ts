import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

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
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxUnitTestList)
    const {profile} = this.resolveProfile(flags)

    const params = new URLSearchParams()
    params.set('per_page', '10000')
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

      const data = (await response.json()) as UnitTest[] | {items?: UnitTest[]}

      let tests: UnitTest[]
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
          this.log('No unit tests found')
        } else {
          this.log(`Unit tests for sandbox environment:`)
          for (const test of tests) {
            this.log(`  - ${test.name} (ID: ${test.id}) [${test.obj_type}: ${test.obj_name}]`)
          }
        }
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
