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

export default class BranchDelete extends BaseCommand {
  static override args = {
    branch_label: Args.string({
      description: 'Branch label to delete (cannot delete "v1" or the live branch)',
      required: true,
    }),
  }
static description = 'Delete a branch (cannot delete "v1" or the live branch)'
static examples = [
    `$ xano branch delete feature-old
Are you sure you want to delete branch 'feature-old'? This action cannot be undone. (y/N) y
Deleted branch: feature-old
`,
    `$ xano branch delete dev --force
Deleted branch: dev
`,
    `$ xano branch delete staging -f -o json
{
  "deleted": true,
  "branch_label": "staging"
}
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skip confirmation prompt',
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
    const {args, flags} = await this.parse(BranchDelete)

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
        'Usage: xano branch delete <branch_label> [--workspace <workspace_id>]',
      )
    }

    const branchLabel = args.branch_label

    // Warn about protected branches
    if (branchLabel === 'v1') {
      this.error('Cannot delete the "v1" branch. This is the default branch and cannot be removed.')
    }

    // Confirmation prompt unless --force is used
    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to delete branch '${branchLabel}'? This action cannot be undone.`
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/branch/${encodeURIComponent(branchLabel)}`

    // Delete branch via the API
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify({branch_label: branchLabel, deleted: true}, null, 2))
      } else {
        this.log(`Deleted branch: ${branchLabel}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete branch: ${error.message}`)
      } else {
        this.error(`Failed to delete branch: ${String(error)}`)
      }
    }
  }

  private async confirm(message: string): Promise<boolean> {
    // Use readline for simple yes/no confirmation
    const readline = await import('node:readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(`${message} (y/N) `, (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      })
    })
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
