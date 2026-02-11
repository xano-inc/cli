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
  documentation?: {
    link?: string
    require_token?: boolean
  }
  id: number
  name: string
  swagger?: boolean
  updated_at?: number
}

export default class WorkspaceEdit extends BaseCommand {
  static override args = {
    workspace_id: Args.integer({
      description: 'Workspace ID to edit (uses profile workspace if not provided)',
      required: false,
    }),
  }
static description = 'Edit an existing workspace via the Xano Metadata API'
static examples = [
    `$ xano workspace edit 123 --name "new-name"
Updated workspace: new-name (ID: 123)
`,
    `$ xano workspace edit --name "updated-workspace" --description "Updated description"
Updated workspace: updated-workspace (ID: 123)
  Description: Updated description
`,
    `$ xano workspace edit 123 --swagger --require-token
Updated workspace: my-workspace (ID: 123)
  Swagger: enabled
  Require Token: true
`,
    `$ xano workspace edit 123 --no-swagger -o json
{
  "id": 123,
  "name": "my-workspace",
  "swagger": false
}
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'New description for the workspace',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'New name for the workspace',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    'require-token': Flags.boolean({
      allowNo: true,
      description: 'Whether to require a token for documentation access',
      required: false,
    }),
    swagger: Flags.boolean({
      allowNo: true,
      description: 'Enable or disable swagger documentation',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WorkspaceEdit)

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
        'Usage: xano workspace edit <workspace_id> [flags]',
      )
    }

    // Build request body - only include fields that were specified
    const body: {
      description?: string
      documentation?: {require_token?: boolean}
      name?: string
      swagger?: boolean
    } = {}

    if (flags.name !== undefined) {
      body.name = flags.name
    }

    if (flags.description !== undefined) {
      body.description = flags.description
    }

    if (flags.swagger !== undefined) {
      body.swagger = flags.swagger
    }

    if (flags['require-token'] !== undefined) {
      body.documentation = {require_token: flags['require-token']}
    }

    // Check if at least one field is being updated
    if (Object.keys(body).length === 0) {
      this.error(
        'No fields specified to update. Use --name, --description, --swagger, or --require-token flags.\n' +
        'Example: xano workspace edit 123 --name "new-name"',
      )
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}`

    // Update workspace via the API
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

      const workspace = await response.json() as Workspace

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(workspace, null, 2))
      } else {
        // summary format
        this.log(`Updated workspace: ${workspace.name} (ID: ${workspace.id})`)
        if (workspace.description) {
          this.log(`  Description: ${workspace.description}`)
        }

        if (workspace.swagger !== undefined) {
          this.log(`  Swagger: ${workspace.swagger ? 'enabled' : 'disabled'}`)
        }

        if (workspace.documentation?.require_token !== undefined) {
          this.log(`  Require Token: ${workspace.documentation.require_token}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to update workspace: ${error.message}`)
      } else {
        this.error(`Failed to update workspace: ${String(error)}`)
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
