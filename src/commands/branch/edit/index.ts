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
  live?: boolean
}

export default class BranchEdit extends BaseCommand {
  static override args = {
    branch_label: Args.string({
      description: 'Branch label to edit (cannot edit "v1" label)',
      required: true,
    }),
  }
static description = 'Update an existing branch (cannot update "v1" label)'
static examples = [
    `$ xano branch edit dev --label development
Updated branch: development
`,
    `$ xano branch edit feature-auth -l feature-authentication --color "#ff5733"
Updated branch: feature-authentication
  Color: #ff5733
`,
    `$ xano branch edit staging --description "Staging environment" -o json
{
  "created_at": "2024-02-10T09:15:00Z",
  "label": "staging",
  "backup": false
}
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    color: Flags.string({
      char: 'c',
      description: 'New color hex code for the branch (e.g., "#ff5733")',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'New description for the branch',
      required: false,
    }),
    label: Flags.string({
      char: 'l',
      description: 'New label for the branch',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    workspace: Flags.integer({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BranchEdit)

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
        'Usage: xano branch edit <branch_label> [--workspace <workspace_id>]',
      )
    }

    const branchLabel = args.branch_label

    // Build request body - only include fields that were specified
    const body: {
      color?: string
      description?: string
      label?: string
    } = {}

    if (flags.label !== undefined) {
      body.label = flags.label
    }

    if (flags.description !== undefined) {
      body.description = flags.description
    }

    if (flags.color !== undefined) {
      body.color = flags.color
    }

    // Check if at least one field is being updated
    if (Object.keys(body).length === 0) {
      this.error(
        'No fields specified to update. Use --label, --description, or --color flags.\n' +
        'Example: xano branch edit dev --label development',
      )
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/branch/${encodeURIComponent(branchLabel)}`

    // Update branch via the API
    try {
      const response = await fetch(apiUrl, {
        body: JSON.stringify(body),
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
          'content-type': 'application/json',
        },
        method: 'PUT',
      })

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
        this.log(`Updated branch: ${branch.label}`)
        if (flags.description) {
          this.log(`  Description: ${flags.description}`)
        }

        if (flags.color) {
          this.log(`  Color: ${flags.color}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to update branch: ${error.message}`)
      } else {
        this.error(`Failed to update branch: ${String(error)}`)
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
