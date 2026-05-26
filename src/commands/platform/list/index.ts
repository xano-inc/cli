import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

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

    const {profile} = this.resolveProfile(flags)

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
}
