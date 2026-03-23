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

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${tenantWorkspaceId}/unit_test/${encodeURIComponent(args.unit_test_id)}/run`

    try {
      if (flags.output === 'summary') {
        this.log(`Running unit test ${args.unit_test_id}...`)
      }

      const response = await this.verboseFetch(
        apiUrl,
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

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const result = (await response.json()) as RunResult

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        if (result.status === 'ok') {
          this.log('Result: PASS')
        } else {
          this.log('Result: FAIL')
          const failedExpects = result.results?.filter((r) => r.status === 'fail') ?? []
          for (const expect of failedExpects) {
            if (expect.message) {
              this.log(`  Error: ${expect.message}`)
            }
          }

          this.exit(1)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to run unit test: ${error.message}`)
      } else {
        this.error(`Failed to run unit test: ${String(error)}`)
      }
    }
  }
}
