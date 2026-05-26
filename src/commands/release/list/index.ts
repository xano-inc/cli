import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Release {
  branch?: string
  created_at?: number
  description?: string
  hotfix?: boolean
  id: number
  name: string
  resource_size?: number
}

export default class ReleaseList extends BaseCommand {
  static description = 'List all releases in a workspace'
  static examples = [
    `$ xano release list
Releases in workspace 5:
  - v1.0 (ID: 10) - main
  - v1.1-hotfix (ID: 11) - main [hotfix]
`,
    `$ xano release list -w 5 --output json`,
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
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ReleaseList)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release`

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

      const data = (await response.json()) as Release[] | {items?: Release[]}

      let releases: Release[]
      if (Array.isArray(data)) {
        releases = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        releases = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(releases, null, 2))
      } else {
        if (releases.length === 0) {
          this.log('No releases found')
        } else {
          this.log(`Releases in workspace ${workspaceId}:`)
          for (const release of releases) {
            const branch = release.branch ? ` - ${release.branch}` : ''
            const hotfix = release.hotfix ? ' [hotfix]' : ''
            const createdAt = release.created_at
              ? ` (${new Date(release.created_at).toLocaleString(undefined, {timeZoneName: 'short'})})`
              : ''
            this.log(`  - ${release.name} (ID: ${release.id})${branch}${hotfix}${createdAt}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list releases: ${error.message}`)
      } else {
        this.error(`Failed to list releases: ${String(error)}`)
      }
    }
  }
}
