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

interface Platform {
  created_at?: number | string
  helm?: {container?: string; name?: string; tag?: string}
  id: number
  images?: Record<string, {name?: string; tag?: string}>
  name: string
}

export default class PlatformGet extends BaseCommand {
  static override args = {
    platform_id: Args.integer({
      description: 'Platform ID to retrieve',
      required: true,
    }),
  }
  static description = 'Get details of a specific platform'
  static examples = [
    `$ xano platform get 23629
Platform ID: 23629
  Created: 2025-11-28
  Helm: 0.1.356
  Images:
    backend          0.0.2985
    frontend         0.1.3427
    database         0.1.6
    node             0.1.192
    deno             0.0.212
    redis            0.1.34
    realtime         0.1.149
    standalone       0.0.2456
    playwright       0.0.992
    static           0.0.10
    static-build     0.0.4
    backend-encoded  0.0.1396
`,
    `$ xano platform get 23629 -o json`,
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
    const {args, flags} = await this.parse(PlatformGet)

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

    const platformId = args.platform_id

    const apiUrl = `${profile.instance_origin}/api:meta/platform/${platformId}`

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

      const platform = await response.json() as Platform

      if (flags.output === 'json') {
        this.log(JSON.stringify(platform, null, 2))
      } else {
        const label = platform.name ? `Platform: ${platform.name} (ID: ${platform.id})` : `Platform ID: ${platform.id}`
        this.log(label)

        if (platform.created_at) {
          const createdDate = new Date(platform.created_at).toISOString().split('T')[0]
          this.log(`  Created: ${createdDate}`)
        }

        if (platform.helm?.tag) {
          this.log(`  Helm: ${platform.helm.tag}`)
        }

        if (platform.images && Object.keys(platform.images).length > 0) {
          this.log('  Images:')
          const maxLen = Math.max(...Object.keys(platform.images).map(k => k.length))
          for (const [name, image] of Object.entries(platform.images)) {
            this.log(`    ${name.padEnd(maxLen)}  ${image.tag ?? 'unknown'}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get platform: ${error.message}`)
      } else {
        this.error(`Failed to get platform: ${String(error)}`)
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
