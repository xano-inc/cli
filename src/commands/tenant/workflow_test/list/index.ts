import {Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'
import {buildPagingJson, buildPagingParams, formatPagingFooter, normalizeListResponse, pagingFlags} from '../../../../utils/paging.js'

interface WorkflowTest {
  description?: string
  id: number
  name: string
}

export default class TenantWorkflowTestList extends BaseCommand {
  static description = 'List workflow tests for a tenant'
  static examples = [
    `$ xano tenant workflow-test list -t my-tenant
Workflow tests for tenant my-tenant:
  - my-test (ID: 1)
`,
    `$ xano tenant workflow-test list -t my-tenant -w 5 -o json`,
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
    ...pagingFlags('envelope', {maxPerPage: 10_000}),
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
    const {flags} = await this.parse(TenantWorkflowTestList)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = encodeURIComponent(flags.tenant)

    const params = new URLSearchParams(buildPagingParams(flags, 'envelope'))
    if (flags.branch) params.set('branch', flags.branch)

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/workflow_test?${params}`

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
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const list = normalizeListResponse<WorkflowTest>(await response.json())
      const tests = list.items

      if (flags.output === 'json') {
        this.log(JSON.stringify(buildPagingJson(list, {page: flags.page, perPage: flags.per_page, tier: 'envelope'}), null, 2))
      } else {
        if (tests.length === 0) {
          this.log('No workflow tests found')
        } else {
          this.log(`Workflow tests for tenant ${flags.tenant}:`)
          for (const test of tests) {
            this.log(`  - ${test.name} (ID: ${test.id})`)
          }
        }

        const footer = formatPagingFooter(list, {noun: 'workflow test', page: flags.page, tier: 'envelope'})
        if (footer) this.log(footer)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list workflow tests: ${error.message}`)
      } else {
        this.error(`Failed to list workflow tests: ${String(error)}`)
      }
    }
  }
}
