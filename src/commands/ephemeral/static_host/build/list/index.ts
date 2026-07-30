import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../../base-command.js'
import {buildPagingJson, buildPagingParams, formatPagingFooter, normalizeListResponse, pagingFlags} from '../../../../../utils/paging.js'

interface Build {
  created_at?: number | string
  description?: string
  file_bytes?: number
  file_count?: number
  id: number
  name: string
  status?: string
  updated_at?: number | string
  // Add other build properties as needed
}

export default class EphemeralStaticHostBuildList extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name',
      required: true,
    }),
  }
static description = 'List all builds for a static host of an ephemeral tenant'
static examples = [
    `$ xano ephemeral static_host build list e4f2-9ab1-xyz1 --static-host default -w 40
Available builds:
  - v1.0.0 (ID: 1) - Status: completed
  - v1.0.1 (ID: 2) - Status: pending
`,
    `$ xano ephemeral static_host build list e4f2-9ab1-xyz1 -H myhost --profile production
Available builds:
  - production (ID: 1) - Status: completed
  - staging (ID: 2) - Status: completed
`,
    `$ xano ephemeral static_host build list e4f2-9ab1-xyz1 -H default -w 40 --output json
{
  "count": 1,
  "page": 1,
  "total": 12,
  "items": [
    {
      "id": 52
    }
  ]
}
`,
    `$ xano ephemeral static_host build list e4f2-9ab1-xyz1 -H default -p staging -o json --page 2
[
  {
    "id": 3,
    "name": "v1.0.2"
  }
]
`,
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
    ...pagingFlags('page-only-envelope', {fixedPerPage: 100}),
    'static-host': Flags.string({
      char: 'H',
      description: 'Static host name',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralStaticHostBuildList)

    const {profile, profileName} = this.resolveProfile(flags)

    const tenantName = args.tenant_name
    const staticHost = flags['static-host']

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano ephemeral static_host build list <tenant_name> --static-host <static_host> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Build query parameters
    const queryParams = new URLSearchParams(buildPagingParams(flags, 'page-only-envelope'))

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/static_host/${staticHost}/build?${queryParams.toString()}`

    // Fetch builds from the API
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

      const list = normalizeListResponse<Build>(await response.json(), ['builds'])
      const builds = list.items

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(buildPagingJson(list, {page: flags.page, tier: 'page-only-envelope'}), null, 2))
      } else {
        // summary format
        if (builds.length === 0) {
          this.log('No builds found')
        } else {
          this.log('Available builds:')
          for (const build of builds) {
            if (build.id === undefined) {
              this.log(`  - ${build.name}`)
            } else {
              const statusInfo = build.status ? ` - Status: ${build.status}` : ''
              this.log(`  - ${build.name} (ID: ${build.id})${statusInfo}`)
            }
          }
        }

        const footer = formatPagingFooter(list, {noun: 'build', page: flags.page, tier: 'page-only-envelope'})
        if (footer) this.log(footer)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch builds: ${error.message}`)
      } else {
        this.error(`Failed to fetch builds: ${String(error)}`)
      }
    }
  }

}
