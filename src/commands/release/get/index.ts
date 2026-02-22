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

interface Release {
  branch?: string
  created_at?: number | string
  description?: string
  hotfix?: boolean
  id: number
  name: string
  resource_size?: number
  tables?: Array<{cnt?: number; id?: number; name?: string}>
}

export default class ReleaseGet extends BaseCommand {
  static override args = {
    release_name: Args.string({
      description: 'Release name to retrieve',
      required: true,
    }),
  }
  static description = 'Get details of a specific release'
  static examples = [
    `$ xano release get v1.0
Release: v1.0 - ID: 10
  Branch: main
  Description: Initial release
  Hotfix: false
`,
    `$ xano release get v1.0 -w 5 -o json`,
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
    const {args, flags} = await this.parse(ReleaseGet)

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

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const releaseId = await this.resolveReleaseName(profile, workspaceId, args.release_name, flags.verbose)

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release/${releaseId}`

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

      const release = await response.json() as Release

      if (flags.output === 'json') {
        this.log(JSON.stringify(release, null, 2))
      } else {
        this.log(`Release: ${release.name} - ID: ${release.id}`)
        if (release.branch) this.log(`  Branch: ${release.branch}`)
        if (release.description) this.log(`  Description: ${release.description}`)
        if (release.hotfix !== undefined) this.log(`  Hotfix: ${release.hotfix}`)
        if (release.resource_size !== undefined) this.log(`  Resource Size: ${release.resource_size}`)
        if (release.tables && release.tables.length > 0) {
          this.log(`  Tables: ${release.tables.map(t => t.name || t.id).join(', ')}`)
        }

        if (release.created_at) {
          const createdDate = new Date(release.created_at).toISOString().split('T')[0]
          this.log(`  Created: ${createdDate}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get release: ${error.message}`)
      } else {
        this.error(`Failed to get release: ${String(error)}`)
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

  private async resolveReleaseName(
    profile: ProfileConfig,
    workspaceId: string,
    releaseName: string,
    verbose: boolean,
  ): Promise<number> {
    const listUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release`

    const response = await this.verboseFetch(
      listUrl,
      {
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      },
      verbose,
      profile.access_token,
    )

    if (!response.ok) {
      const errorText = await response.text()
      this.error(
        `Failed to list releases: ${response.status} ${response.statusText}\n${errorText}`,
      )
    }

    const data = await response.json() as Release[] | {items?: Release[]}
    const releases: Release[] = Array.isArray(data)
      ? data
      : (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items))
        ? data.items
        : []

    const match = releases.find(r => r.name === releaseName)
    if (!match) {
      const available = releases.map(r => r.name).join(', ')
      this.error(
        `Release '${releaseName}' not found.${available ? ` Available releases: ${available}` : ''}`,
      )
    }

    return match.id
  }
}
