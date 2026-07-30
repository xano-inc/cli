import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {buildPagingJson, buildPagingParams, formatPagingFooter, normalizeListResponse, pagingFlags} from '../../../utils/paging.js'

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

export default class UnitTestList extends BaseCommand {
  static description = 'List all unit tests in a workspace'
  static examples = [
    `$ xano unit-test list
Unit tests in workspace 5:
  - my-test (ID: abc-123) [function: math]
  - auth-check (ID: def-456) [query: /user/login]
`,
    `$ xano unit-test list -w 5 --output json`,
    `$ xano unit-test list --obj-type function`,
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(UnitTestList)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const params = new URLSearchParams(buildPagingParams(flags, 'envelope'))
    if (flags.branch) {
      params.set('branch', flags.branch)
    }

    if (flags['obj-type']) {
      params.set('obj_type', flags['obj-type'])
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/unit_test?${params}`

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

      const list = normalizeListResponse<UnitTest>(await response.json())
      const tests = list.items

      if (flags.output === 'json') {
        this.log(JSON.stringify(buildPagingJson(list, {page: flags.page, perPage: flags.per_page, tier: 'envelope'}), null, 2))
      } else {
        if (tests.length === 0) {
          this.log('No unit tests found')
        } else {
          this.log(`Unit tests in workspace ${workspaceId}:`)
          for (const test of tests) {
            this.log(`  - ${test.name} (ID: ${test.id}) [${test.obj_type}: ${test.obj_name}]`)
          }
        }

        const footer = formatPagingFooter(list, {noun: 'unit test', page: flags.page, tier: 'envelope'})
        if (footer) this.log(footer)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list unit tests: ${error.message}`)
      } else {
        this.error(`Failed to list unit tests: ${String(error)}`)
      }
    }
  }
}
