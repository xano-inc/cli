import {Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../base-command.js'

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

interface Workspace {
  created_at?: number
  id: number
  name: string
  // Add other workspace properties as needed
}

interface WorkspaceListResponse {
  workspaces?: Workspace[]
  // Handle both array and object responses
}

export default class WorkspaceList extends BaseCommand {
  static description = 'List all workspaces from the Xano Metadata API'
static examples = [
    `$ xano workspace:list
Available workspaces:
  - workspace-1 (ID: 1)
  - workspace-2 (ID: 2)
  - workspace-3 (ID: 3)
`,
    `$ xano workspace:list --profile production
Available workspaces:
  - my-app (ID: 1)
  - staging-env (ID: 2)
`,
    `$ xano workspace:list --output json
{
  "workspaces": [
    {
      "id": 1,
      "name": "workspace-1"
    },
    {
      "id": 2,
      "name": "workspace-2"
    }
  ]
}
`,
    `$ xano workspace:list -p staging -o json
{
  "workspaces": [
    {
      "id": 1,
      "name": "my-app"
    }
  ]
}
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
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(WorkspaceList)

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

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace`

    // Fetch workspaces from the API
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

      const data = await response.json() as Workspace[] | WorkspaceListResponse

      // Handle different response formats
      let workspaces: Workspace[]

      if (Array.isArray(data)) {
        workspaces = data
      } else if (data && typeof data === 'object' && 'workspaces' in data && Array.isArray(data.workspaces)) {
        workspaces = data.workspaces
      } else {
        this.error('Unexpected API response format')
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(workspaces, null, 2))
      } else {
        // summary format
        if (workspaces.length === 0) {
          this.log('No workspaces found')
        } else {
          this.log('Available workspaces:')
          for (const workspace of workspaces) {
            if (workspace.id === undefined) {
              this.log(`  - ${workspace.name}`)
            } else {
              this.log(`  - ${workspace.name} (ID: ${workspace.id})`)
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch workspaces: ${error.message}`)
      } else {
        this.error(`Failed to fetch workspaces: ${String(error)}`)
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
