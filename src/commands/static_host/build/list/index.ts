import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface Build {
  created_at?: number | string
  description?: string
  id: number
  name: string
  status?: string
  updated_at?: number | string
  // Add other build properties as needed
}

interface BuildListResponse {
  builds?: Build[]
  items?: Build[]
  // Handle both array and object responses
}

export default class StaticHostBuildList extends BaseCommand {
  static args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
  }
static description = 'List all builds for a static host'
static examples = [
    `$ xano static_host:build:list default -w 40
Available builds:
  - v1.0.0 (ID: 1) - Status: completed
  - v1.0.1 (ID: 2) - Status: pending
`,
    `$ xano static_host:build:list myhost --profile production
Available builds:
  - production (ID: 1) - Status: completed
  - staging (ID: 2) - Status: completed
`,
    `$ xano static_host:build:list default -w 40 --output json
[
  {
    "id": 1,
    "name": "v1.0.0",
    "status": "completed"
  }
]
`,
    `$ xano static_host:build:list default -p staging -o json --page 2
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
    page: Flags.integer({
      default: 1,
      description: 'Page number for pagination',
      required: false,
    }),
    per_page: Flags.integer({
      default: 50,
      description: 'Number of results per page',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StaticHostBuildList)

    const {profile, profileName} = this.resolveProfile(flags)

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano static_host:build:list <static_host> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Build query parameters
    const queryParams = new URLSearchParams({
      page: flags.page.toString(),
    })

    // Only add per_page if it's not the default value
    if (flags.per_page !== 50) {
      queryParams.append('per_page', flags.per_page.toString())
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}/build?${queryParams.toString()}`

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

      const data = await response.json() as Build[] | BuildListResponse

      // Handle different response formats
      let builds: Build[]

      if (Array.isArray(data)) {
        builds = data
      } else if (data && typeof data === 'object' && 'builds' in data && Array.isArray(data.builds)) {
        builds = data.builds
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        builds = data.items
      } else {
        this.error('Unexpected API response format')
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(builds, null, 2))
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
