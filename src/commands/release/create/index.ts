import {Args, Flags} from '@oclif/core'

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

export default class ReleaseCreate extends BaseCommand {
  static override args = {
    name: Args.string({
      description: 'Name for the release',
      required: true,
    }),
  }
  static description = 'Create a new release in a workspace'
  static examples = [
    `$ xano release create "v1.0" --branch main
Created release: v1.0 - ID: 10
`,
    `$ xano release create "v1.1-hotfix" --branch main --hotfix --description "Critical fix" -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch to create the release from',
      required: true,
    }),
    description: Flags.string({
      char: 'd',
      description: 'Release description',
      required: false,
    }),
    hotfix: Flags.boolean({
      default: false,
      description: 'Mark as a hotfix release',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    'table-ids': Flags.string({
      description: 'Comma-separated table IDs to include',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ReleaseCreate)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const body: Record<string, unknown> = {
      branch: flags.branch,
      hotfix: flags.hotfix,
      name: args.name,
    }

    if (flags.description) body.description = flags.description
    if (flags['table-ids']) {
      body.table_ids = flags['table-ids'].split(',').map(id => Number.parseInt(id.trim(), 10))
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
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
        this.log(`Created release: ${release.name} - ID: ${release.id}`)
        if (release.branch) this.log(`  Branch: ${release.branch}`)
        if (release.hotfix) this.log(`  Hotfix: true`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create release: ${error.message}`)
      } else {
        this.error(`Failed to create release: ${String(error)}`)
      }
    }
  }
}
