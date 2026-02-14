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

interface Platform {
  created_at?: number | string
  helm?: {container?: string; name?: string; tag?: string}
  id: number
  images?: Record<string, {name?: string; tag?: string}>
  name: string
}

export default class PlatformList extends BaseCommand {
  static description = 'List all platforms'
  static examples = [
    `$ xano platform list
Platforms:
  ID: 23629 | Helm: 0.1.356 | Created: 2025-11-28
`,
    `$ xano platform list --output json`,
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
    const {flags} = await this.parse(PlatformList)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentials()

    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xano profile create'`,
      )
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const apiUrl = `${profile.instance_origin}/api:meta/platform`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'GET',
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

      const data = await response.json() as Platform[] | {items?: Platform[]}

      let platforms: Platform[]
      if (Array.isArray(data)) {
        platforms = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        platforms = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(platforms, null, 2))
      } else {
        if (platforms.length === 0) {
          this.log('No platforms found')
        } else {
          this.log('Platforms:')
          for (const platform of platforms) {
            const label = platform.name || `ID: ${platform.id}`
            const helmTag = platform.helm?.tag ? ` | Helm: ${platform.helm.tag}` : ''
            const created = platform.created_at
              ? ` | Created: ${new Date(platform.created_at).toISOString().split('T')[0]}`
              : ''
            this.log(`  ${label}${helmTag}${created}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list platforms: ${error.message}`)
      } else {
        this.error(`Failed to list platforms: ${String(error)}`)
      }
    }
  }

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      this.error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile create'`,
      )
    }

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
