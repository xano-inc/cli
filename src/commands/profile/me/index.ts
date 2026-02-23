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

interface UserInfo {
  [key: string]: unknown
  created_at?: number
  email?: string
  id: number
  name?: string
}

export default class ProfileMe extends BaseCommand {
  static description = 'Get information about the currently authenticated user'
  static examples = [
    `$ xano profile:me
User Information:
  ID: 1
  Name: John Doe
  Email: john@example.com
`,
    `$ xano profile:me --profile production
User Information:
  ID: 42
  Name: Admin User
  Email: admin@example.com
`,
    `$ xano profile:me --output json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com"
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
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfileMe)

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

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/auth/me`

    // Fetch user info from the API
    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
          },
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const data = (await response.json()) as UserInfo

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
      } else {
        // summary format
        this.log('User Information:')
        if (data.id !== undefined) {
          this.log(`  ID: ${data.id}`)
        }

        if (data.name) {
          this.log(`  Name: ${data.name}`)
        }

        if (data.email) {
          this.log(`  Email: ${data.email}`)
        }

        if (data.created_at) {
          const date = new Date(data.created_at * 1000)
          this.log(`  Created: ${date.toISOString()}`)
        }

        // Display extra fields from the API response
        const knownFields = new Set(['created_at', 'email', 'id', 'name'])

        // In default mode, show condensed instance info from extras
        // In verbose mode, show all extra fields with full detail
        const extras = data.extras as Record<string, unknown> | undefined
        if (extras?.instance && typeof extras.instance === 'object') {
          const inst = extras.instance as Record<string, unknown>
          this.log('')
          this.log('Instance Information:')
          if (inst.id) this.log(`  ID: ${inst.id}`)
          if (inst.name) this.log(`  Name: ${inst.name}`)
          if (inst.display) this.log(`  Display: ${inst.display}`)
        }

        if (flags.verbose) {
          knownFields.add('extras')
          for (const [key, value] of Object.entries(data)) {
            if (!knownFields.has(key) && value !== null && value !== undefined) {
              if (typeof value === 'object') {
                this.log(`  ${this.formatKey(key)}: ${JSON.stringify(value, null, 2)}`)
              } else {
                this.log(`  ${this.formatKey(key)}: ${value}`)
              }
            }
          }

          if (extras) {
            this.log(`  Extras: ${JSON.stringify(extras, null, 2)}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch user info: ${error.message}`)
      } else {
        this.error(`Failed to fetch user info: ${String(error)}`)
      }
    }
  }

  private formatKey(key: string): string {
    // Convert snake_case to Title Case
    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      this.error(`Credentials file not found at ${credentialsPath}\n` + `Create a profile using 'xano profile:create'`)
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
