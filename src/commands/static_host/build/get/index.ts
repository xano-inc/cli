import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

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

interface Build {
  [key: string]: any
  created_at?: number | string
  description?: string
  id: number
  name: string
  status?: string
  updated_at?: number | string
}

export default class StaticHostBuildGet extends BaseCommand {
  static args = {
    build_id: Args.string({
      description: 'Build ID',
      required: true,
    }),
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
  }
static description = 'Get details of a specific build for a static host'
static examples = [
    `$ xano static_host:build:get default 52
Build Details:
ID: 52
Name: v1.0.0
Status: completed
`,
    `$ xano static_host:build:get default 52 -w 40
Build Details:
ID: 52
Name: v1.0.0
Status: completed
`,
    `$ xano static_host:build:get myhost 123 --profile production
Build Details:
ID: 123
Name: production-build
`,
    `$ xano static_host:build:get default 52 -o json
{
  "id": 52,
  "name": "v1.0.0",
  "status": "completed"
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StaticHostBuildGet)

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

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano static_host:build:get <static_host> <build_id> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}/build/${args.build_id}`

    // Fetch build from the API
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

      const build = await response.json() as Build

      // Validate response
      if (!build || typeof build !== 'object') {
        this.error('Unexpected API response format')
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(build, null, 2))
      } else {
        // summary format
        this.log('Build Details:')
        this.log(`ID: ${build.id}`)
        this.log(`Name: ${build.name}`)

        if (build.description) {
          this.log(`Description: ${build.description}`)
        }

        if (build.status) {
          this.log(`Status: ${build.status}`)
        }

        if (build.created_at) {
          this.log(`Created: ${build.created_at}`)
        }

        if (build.updated_at) {
          this.log(`Updated: ${build.updated_at}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch build: ${error.message}`)
      } else {
        this.error(`Failed to fetch build: ${String(error)}`)
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
