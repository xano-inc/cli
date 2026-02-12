import {Args, Flags} from '@oclif/core'
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
  description?: string
  id: number
  name: string
  updated_at?: number
}

export default class WorkspaceGet extends BaseCommand {
  static override args = {
    workspace_id: Args.integer({
      description: 'Workspace ID to get details for (uses profile workspace if not provided)',
      required: false,
    }),
  }
static description = 'Get details of a specific workspace from the Xano Metadata API'
static examples = [
    `$ xano workspace get 123
Workspace: my-workspace (ID: 123)
  Description: My workspace description
  Created: 2024-01-15
`,
    `$ xano workspace get --output json
{
  "id": 123,
  "name": "my-workspace",
  "description": "My workspace description"
}
`,
    `$ xano workspace get 456 -p production -o json
{
  "id": 456,
  "name": "production-workspace"
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
    const {args, flags} = await this.parse(WorkspaceGet)

    // Get profile name (default or from flag/env)
    const profileName = flags.profile || this.getDefaultProfile()

    // Load credentials
    const credentials = this.loadCredentials()

    // Get the profile configuration
    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xano profile create'`,
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

    // Get workspace ID from args or profile
    const workspaceId = args.workspace_id || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Either pass a workspace ID as an argument or set one in your profile.\n' +
        'Usage: xano workspace get <workspace_id>',
      )
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}`

    // Fetch workspace from the API
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

      const workspace = await response.json() as Workspace

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(workspace, null, 2))
      } else {
        // summary format
        this.log(`Workspace: ${workspace.name} (ID: ${workspace.id})`)
        if (workspace.description) {
          this.log(`  Description: ${workspace.description}`)
        }

        if (workspace.created_at) {
          const createdDate = new Date(workspace.created_at * 1000).toISOString().split('T')[0]
          this.log(`  Created: ${createdDate}`)
        }

        if (workspace.updated_at) {
          const updatedDate = new Date(workspace.updated_at * 1000).toISOString().split('T')[0]
          this.log(`  Updated: ${updatedDate}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch workspace: ${error.message}`)
      } else {
        this.error(`Failed to fetch workspace: ${String(error)}`)
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
        `Create a profile using 'xano profile create'`,
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
