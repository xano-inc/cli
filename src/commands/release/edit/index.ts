import {Args, Flags} from '@oclif/core'

import BaseCommand, {type ProfileConfig} from '../../../base-command.js'

interface Release {
  branch?: string
  created_at?: number
  description?: string
  hotfix?: boolean
  id: number
  name: string
  resource_size?: number
}

export default class ReleaseEdit extends BaseCommand {
  static override args = {
    release_name: Args.string({
      description: 'Release name to edit',
      required: true,
    }),
  }
  static description = 'Edit an existing release'
  static examples = [
    `$ xano release edit v1.0 --name "v1.0-final" --description "Updated description"
Updated release: v1.0-final - ID: 10
`,
    `$ xano release edit v1.0 --description "New description" -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'New description',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'New name for the release',
      required: false,
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
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ReleaseEdit)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const releaseId = await this.resolveReleaseName(profile, workspaceId, args.release_name, flags.verbose)

    const baseUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release/${releaseId}`
    const headers = {
      'accept': 'application/json',
      'Authorization': `Bearer ${profile.access_token}`,
      'Content-Type': 'application/json',
    }

    try {
      // Fetch current release state (PUT requires all fields)
      const getResponse = await this.verboseFetch(
        baseUrl,
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

      if (!getResponse.ok) {
        const errorText = await getResponse.text()
        this.error(
          `Failed to fetch release: ${getResponse.status} ${getResponse.statusText}\n${errorText}`,
        )
      }

      const current = await getResponse.json() as Release

      // Merge in user-provided values
      const body: Record<string, unknown> = {
        description: flags.description !== undefined ? flags.description : (current.description ?? ''),
        name: flags.name !== undefined ? flags.name : current.name,
      }

      // Update release
      const putResponse = await this.verboseFetch(
        baseUrl,
        {
          body: JSON.stringify(body),
          headers,
          method: 'PUT',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!putResponse.ok) {
        const errorText = await putResponse.text()
        this.error(
          `API request failed with status ${putResponse.status}: ${putResponse.statusText}\n${errorText}`,
        )
      }

      const release = await putResponse.json() as Release

      if (flags.output === 'json') {
        this.log(JSON.stringify(release, null, 2))
      } else {
        this.log(`Updated release: ${release.name} - ID: ${release.id}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to edit release: ${error.message}`)
      } else {
        this.error(`Failed to edit release: ${String(error)}`)
      }
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
