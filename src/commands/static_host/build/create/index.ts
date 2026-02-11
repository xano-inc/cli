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

interface BuildCreateResponse {
  [key: string]: any
  id: number
  name: string
  status?: string
}

export default class StaticHostBuildCreate extends BaseCommand {
  static args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
  }
static description = 'Create a new build for a static host'
static examples = [
    `$ xano static_host:build:create default -f ./build.zip -n "v1.0.0"
Build created successfully!
ID: 123
Name: v1.0.0
Status: pending
`,
    `$ xano static_host:build:create default -w 40 -f ./dist.zip -n "production" -d "Production build"
Build created successfully!
ID: 124
Name: production
Description: Production build
`,
    `$ xano static_host:build:create myhost -f ./app.zip -n "release-1.2" -o json
{
  "id": 125,
  "name": "release-1.2",
  "status": "pending"
}
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'Build description',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to zip file to upload',
      required: true,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Build name',
      required: true,
    }),
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
    const {args, flags} = await this.parse(StaticHostBuildCreate)

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
        `  1. Provide it as a flag: xano static_host:build:create <static_host> -f <file> -n <name> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Validate file exists
    const filePath = path.resolve(flags.file)
    if (!fs.existsSync(filePath)) {
      this.error(`File not found: ${filePath}`)
    }

    // Check if file is readable
    try {
      fs.accessSync(filePath, fs.constants.R_OK)
    } catch {
      this.error(`File is not readable: ${filePath}`)
    }

    // Get file stats
    const stats = fs.statSync(filePath)
    if (!stats.isFile()) {
      this.error(`Path is not a file: ${filePath}`)
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}/build`

    // Create FormData
    const FormData = (await import('node:buffer')).Blob
    const formData = new (globalThis as any).FormData()

    // Read file and create blob
    const fileBuffer = fs.readFileSync(filePath)
    const blob = new Blob([fileBuffer], {type: 'application/zip'})
    formData.append('file', blob, path.basename(filePath))
    formData.append('name', flags.name)

    if (flags.description) {
      formData.append('description', flags.description)
    }

    // Create build via API
    try {
      const response = await fetch(apiUrl, {
        body: formData,
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        method: 'POST',
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const result = await response.json() as BuildCreateResponse

      // Validate response
      if (!result || typeof result !== 'object') {
        this.error('Unexpected API response format')
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        // summary format
        this.log('Build created successfully!')
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)

        if (result.status) {
          this.log(`Status: ${result.status}`)
        }

        if (flags.description) {
          this.log(`Description: ${flags.description}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create build: ${error.message}`)
      } else {
        this.error(`Failed to create build: ${String(error)}`)
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
