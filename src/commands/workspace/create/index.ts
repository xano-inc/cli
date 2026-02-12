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
  description?: string
  id: number
  name: string
  updated_at?: number
}

export default class WorkspaceCreate extends BaseCommand {
  static description = 'Create a new workspace via the Xano Metadata API'
static examples = [
    `$ xano workspace create --name "my-workspace"
Created workspace: my-workspace (ID: 123)
`,
    `$ xano workspace create --name "my-app" --description "My application workspace"
Created workspace: my-app (ID: 456)
  Description: My application workspace
`,
    `$ xano workspace create -n "new-project" -d "New project workspace" -o json
{
  "id": 789,
  "name": "new-project",
  "description": "New project workspace"
}
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'Description for the workspace',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Name of the workspace',
      required: true,
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
    const {flags} = await this.parse(WorkspaceCreate)

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

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace`

    // Build request body
    const body: {description?: string; name: string;} = {
      name: flags.name,
    }
    if (flags.description) {
      body.description = flags.description
    }

    // Create workspace via the API
    try {
      const response = await fetch(apiUrl, {
        body: JSON.stringify(body),
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      })

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
        this.log(`Created workspace: ${workspace.name} (ID: ${workspace.id})`)
        if (workspace.description) {
          this.log(`  Description: ${workspace.description}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create workspace: ${error.message}`)
      } else {
        this.error(`Failed to create workspace: ${String(error)}`)
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
