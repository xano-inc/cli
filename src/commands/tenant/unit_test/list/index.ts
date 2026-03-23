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

export default class TenantUnitTestList extends BaseCommand {
  static description = 'List all unit tests for a tenant'
  static examples = [
    `$ xano tenant unit-test list -t my-tenant
Unit tests for tenant my-tenant:
  - my-test (ID: abc-123) [function: math]
`,
    `$ xano tenant unit-test list -t my-tenant -w 5 -o json`,
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
    const {flags} = await this.parse(TenantUnitTestList)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\nCreate a profile using 'xano profile create'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    // Resolve tenant to get its workspace
    const tenantUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${encodeURIComponent(flags.tenant)}`
    let tenantWorkspaceId: string

    try {
      const tenantResponse = await this.verboseFetch(
        tenantUrl,
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

      if (!tenantResponse.ok) {
        const errorText = await tenantResponse.text()
        this.error(`Failed to find tenant '${flags.tenant}': ${tenantResponse.status}\n${errorText}`)
      }

      const tenant = (await tenantResponse.json()) as {workspace?: {id?: number}}
      tenantWorkspaceId = String(tenant.workspace?.id || workspaceId)
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to resolve tenant: ${error.message}`)
      } else {
        this.error(`Failed to resolve tenant: ${String(error)}`)
      }
    }

    const params = new URLSearchParams()
    params.set('per_page', '10000')
    if (flags.branch) params.set('branch', flags.branch)
    if (flags['obj-type']) params.set('obj_type', flags['obj-type'])

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${tenantWorkspaceId}/unit_test?${params}`

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
          this.log(`Unit tests for tenant ${flags.tenant}:`)
          for (const test of tests) {
            this.log(`  - ${test.name} (ID: ${test.id}) [${test.obj_type}: ${test.obj_name}]`)
          }
        }
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
