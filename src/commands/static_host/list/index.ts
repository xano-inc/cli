import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {buildPagingParams, formatPagingFooter, normalizeListResponse, pagingFlags} from '../../../utils/paging.js'

interface StaticHost {
  created_at?: number | string
  description?: string
  domain?: string
  id: number
  name: string
  updated_at?: number | string
  // Add other static host properties as needed
}

export default class StaticHostList extends BaseCommand {
  static args = {}
static description = 'List all static hosts in a workspace from the Xano Metadata API'
static examples = [
    `$ xano static_host:list -w 40
Available static hosts:
  - my-static-host (ID: 1)
  - another-host (ID: 2)
`,
    `$ xano static_host:list --profile production
Available static hosts:
  - my-static-host (ID: 1)
  - another-host (ID: 2)
`,
    `$ xano static_host:list -w 40 --output json
[
  {
    "id": 1,
    "name": "my-static-host",
    "domain": "example.com"
  }
]
`,
    `$ xano static_host:list -p staging -o json --page 2
[
  {
    "id": 3,
    "name": "static-host-3"
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(StaticHostList)

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
        `  1. Provide it as a flag: xano static_host:list -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Build query parameters
    const queryParams = new URLSearchParams(buildPagingParams(flags, 'page-only-envelope'))

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host?${queryParams.toString()}`

    // Fetch static hosts from the API
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

      const list = normalizeListResponse<StaticHost>(await response.json(), ['static_hosts'])
      const staticHosts = list.items

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(staticHosts, null, 2))
      } else {
        // summary format
        if (staticHosts.length === 0) {
          this.log('No static hosts found')
        } else {
          this.log('Available static hosts:')
          for (const host of staticHosts) {
            if (host.id === undefined) {
              this.log(`  - ${host.name}`)
            } else {
              const domainInfo = host.domain ? ` - ${host.domain}` : ''
              this.log(`  - ${host.name} (ID: ${host.id})${domainInfo}`)
            }
          }
        }

        const footer = formatPagingFooter(list, {noun: 'static host', page: flags.page, tier: 'page-only-envelope'})
        if (footer) this.log(footer)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch static hosts: ${error.message}`)
      } else {
        this.error(`Failed to fetch static hosts: ${String(error)}`)
      }
    }
  }

}
