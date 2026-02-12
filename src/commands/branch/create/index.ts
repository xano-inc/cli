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

interface Branch {
  backup: boolean
  created_at: string
  label: string
  live: boolean
}

export default class BranchCreate extends BaseCommand {
  static description = 'Create a new branch by cloning from an existing branch'
static examples = [
    `$ xano branch create --label dev
Created branch: dev
  Cloned from: v1
`,
    `$ xano branch create -l feature-auth -s dev -d "Authentication feature"
Created branch: feature-auth
  Cloned from: dev
  Description: Authentication feature
`,
    `$ xano branch create --label staging --color "#ebc346" --output json
{
  "created_at": "2024-02-11T10:00:00Z",
  "label": "staging",
  "backup": false,
  "live": false
}
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    color: Flags.string({
      char: 'c',
      description: 'Color hex code for the branch (e.g., "#ebc346")',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'Description for the new branch',
      required: false,
    }),
    label: Flags.string({
      char: 'l',
      description: 'Label for the new branch',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    source: Flags.string({
      char: 's',
      default: 'v1',
      description: 'Source branch to clone from (defaults to "v1")',
      required: false,
    }),
    workspace: Flags.integer({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(BranchCreate)

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

    // Get workspace ID from flag or profile
    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Either use --workspace flag or set one in your profile.\n' +
        'Usage: xano branch create --label <label> [--workspace <workspace_id>]',
      )
    }

    // Build request body
    const body: {
      color?: string
      description?: string
      label: string
      source_branch?: string
    } = {
      label: flags.label,
      source_branch: flags.source,
    }

    if (flags.description) {
      body.description = flags.description
    }

    if (flags.color) {
      body.color = flags.color
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/branch`

    // Create branch via the API
    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
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

      const branch = await response.json() as Branch

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(branch, null, 2))
      } else {
        // summary format
        this.log(`Created branch: ${branch.label}`)
        this.log(`  Cloned from: ${flags.source}`)
        if (flags.description) {
          this.log(`  Description: ${flags.description}`)
        }

        if (flags.color) {
          this.log(`  Color: ${flags.color}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create branch: ${error.message}`)
      } else {
        this.error(`Failed to create branch: ${String(error)}`)
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
