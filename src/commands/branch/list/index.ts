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

interface Branch {
  backup: boolean
  created_at: string
  label: string
  live: boolean
}

export default class BranchList extends BaseCommand {
  static override args = {
    workspace_id: Args.integer({
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }
static description = 'List all branches in a workspace'
static examples = [
    `$ xano branch list
Available branches:
  - v1 (live)
  - dev
  - staging
`,
    `$ xano branch list 123
Available branches:
  - v1 (live)
  - feature-auth
`,
    `$ xano branch list --output json
[
  {
    "created_at": "2024-01-15T10:30:00Z",
    "label": "v1",
    "backup": false,
    "live": true
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
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BranchList)

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
        'Usage: xano branch list [workspace_id]',
      )
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/branch`

    // Fetch branches from the API
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

      const branches = await response.json() as Branch[]

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(branches, null, 2))
      } else {
        // summary format
        if (branches.length === 0) {
          this.log('No branches found')
        } else {
          this.log('Available branches:')
          for (const branch of branches) {
            const liveIndicator = branch.live ? ' (live)' : ''
            const backupIndicator = branch.backup ? ' (backup)' : ''
            this.log(`  - ${branch.label}${liveIndicator}${backupIndicator}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch branches: ${error.message}`)
      } else {
        this.error(`Failed to fetch branches: ${String(error)}`)
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
