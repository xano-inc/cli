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

export default class WorkspaceDelete extends BaseCommand {
  static override args = {
    workspace_id: Args.integer({
      description: 'Workspace ID to delete',
      required: true,
    }),
  }
static description = 'Delete a workspace via the Xano Metadata API. Cannot delete workspaces with active tenants.'
static examples = [
    `$ xano workspace delete 123
Are you sure you want to delete workspace 123? This action cannot be undone. (y/N) y
Deleted workspace 123
`,
    `$ xano workspace delete 123 --force
Deleted workspace 123
`,
    `$ xano workspace delete 123 -f -o json
{
  "deleted": true,
  "workspace_id": 123
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
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WorkspaceDelete)

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

    const workspaceId = args.workspace_id

    // Confirmation prompt unless --force is used
    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to delete workspace ${workspaceId}? This action cannot be undone.`
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}`

    // Delete workspace via the API
    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'DELETE',
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

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify({deleted: true, workspace_id: workspaceId}, null, 2))
      } else {
        this.log(`Deleted workspace ${workspaceId}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete workspace: ${error.message}`)
      } else {
        this.error(`Failed to delete workspace: ${String(error)}`)
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
