import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

interface ProfileConfig {
  access_token: string
  account_origin?: string
  branch?: string
  instance_origin: string
  workspace?: string
}

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: ProfileConfig
  }
}

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

    // Get profile name (default or from flag/env)
    const profileName = flags.profile || this.getDefaultProfile()

    // Load credentials
    const credentials = this.loadCredentials()

    // Get the profile configuration
    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xano profile:create'`,
      )
    }

    const profile = credentials.profiles[profileName]

    // Validate required fields
    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

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
      const response = await fetch(apiUrl, {
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      })

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

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      this.error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile:create'`,
      )
    }

    // Read credentials file
    try {
      const fileContent = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = yaml.load(fileContent) as CredentialsFile

      if (!parsed || typeof parsed !== 'object' || !('profiles' in parsed)) {
        this.error('Credentials file has invalid format.')
      }

      return parsed
    } catch (error) {
      this.error(`Failed to parse credentials file: ${error}`)
    }
  }
}
