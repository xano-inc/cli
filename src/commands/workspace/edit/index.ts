import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import BaseCommand from '../../../base-command.js'

interface ProfileConfig {
  account_origin?: string
  instance_origin: string
  access_token: string
  workspace?: string
  branch?: string
}

interface CredentialsFile {
  profiles: {
    [key: string]: ProfileConfig
  }
  default?: string
}

interface Workspace {
  id: number
  name: string
  description?: string
  swagger?: boolean
  documentation?: {
    link?: string
    require_token?: boolean
  }
  created_at?: number
  updated_at?: number
}

export default class WorkspaceEdit extends BaseCommand {
  static override args = {
    workspace_id: Args.integer({
      description: 'Workspace ID to edit (uses profile workspace if not provided)',
      required: false,
    }),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    name: Flags.string({
      char: 'n',
      description: 'New name for the workspace',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'New description for the workspace',
      required: false,
    }),
    swagger: Flags.boolean({
      description: 'Enable or disable swagger documentation',
      required: false,
      allowNo: true,
    }),
    'require-token': Flags.boolean({
      description: 'Whether to require a token for documentation access',
      required: false,
      allowNo: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
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
      name?: string
      description?: string
      swagger?: boolean
      documentation?: {require_token?: boolean}
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
        method: 'PUT',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        body: JSON.stringify(body),
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
