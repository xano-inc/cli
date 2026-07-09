import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand, {type ProfileConfig} from '../../../base-command.js'

interface StaticHostGit {
  private_key?: string
  public_key?: string
  repo?: string
}

interface StaticHost {
  [key: string]: unknown
  description?: string
  git?: StaticHostGit
  id: number
  name: string
}

export default class StaticHostEdit extends BaseCommand {
  static args = {
    static_host: Args.string({
      description: 'Static Host name to edit',
      required: true,
    }),
  }
  static description = 'Update a static host\'s name, description, or git configuration'
  static examples = [
    `$ xano static_host edit newsite --description "Marketing site"
Updated static host 'newsite'
`,
    `$ xano static_host edit newsite --name newsite-v2
Updated static host 'newsite' (renamed to 'newsite-v2')
`,
    `$ xano static_host edit newsite --git-repo git@github.com:me/site.git --git-private-key-file ./deploy_key
Updated static host 'newsite'
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      description: 'New description for the static host',
      required: false,
    }),
    'git-private-key-file': Flags.string({
      description: 'Path to a file containing the git SSH private key (read from disk; never passed on the command line)',
      required: false,
    }),
    'git-public-key': Flags.string({
      description: 'Git SSH public key',
      required: false,
    }),
    'git-repo': Flags.string({
      description: 'Git repository URL (e.g. git@github.com:org/repo.git)',
      required: false,
    }),
    name: Flags.string({
      description: 'New name for the static host (renaming changes the deployed hostname)',
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
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StaticHostEdit)

    const hasGitFlag = Boolean(flags['git-repo'] || flags['git-private-key-file'] || flags['git-public-key'])
    if (!flags.name && flags.description === undefined && !hasGitFlag) {
      this.error('Nothing to update. Provide at least one of --name, --description, or a --git-* flag.')
    }

    const {profile, profileName} = this.resolveProfile(flags)

    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano static_host edit <static_host> --name <name> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    // The edit endpoint requires `name`, and merges git as a whole object —
    // so fetch the current record first and only override the fields the user set.
    const current = await this.fetchHost(profile, workspaceId, args.static_host, flags.verbose)

    const git: StaticHostGit = {...current.git}
    if (flags['git-repo'] !== undefined) git.repo = flags['git-repo']
    if (flags['git-public-key'] !== undefined) git.public_key = flags['git-public-key']
    if (flags['git-private-key-file'] !== undefined) {
      const keyPath = path.resolve(flags['git-private-key-file'])
      if (!fs.existsSync(keyPath)) {
        this.error(`Private key file not found: ${keyPath}`)
      }

      git.private_key = fs.readFileSync(keyPath, 'utf8').trim()
    }

    const body = {
      description: flags.description ?? current.description ?? '',
      git: {
        private_key: git.private_key ?? '',
        public_key: git.public_key ?? '',
        repo: git.repo ?? '',
      },
      name: flags.name ?? current.name,
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}/edit`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const message = await this.parseApiError(response, `Failed to update static host '${args.static_host}'`)
        this.error(message)
      }

      const updated = (await response.json()) as StaticHost

      if (flags.output === 'json') {
        this.log(JSON.stringify(updated, null, 2))
      } else {
        const renamed = flags.name && flags.name !== args.static_host ? ` (renamed to '${flags.name}')` : ''
        this.log(`Updated static host '${args.static_host}'${renamed}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to update static host: ${error.message}`)
      } else {
        this.error(`Failed to update static host: ${String(error)}`)
      }
    }
  }

  /** Fetch the current host record so unspecified fields are preserved on edit. */
  private async fetchHost(
    profile: ProfileConfig,
    workspaceId: string,
    staticHost: string,
    verbose: boolean,
  ): Promise<StaticHost> {
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${staticHost}`

    const response = await this.verboseFetch(
      apiUrl,
      {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      },
      verbose,
      profile.access_token,
    )

    if (!response.ok) {
      const message = await this.parseApiError(response, `Static host '${staticHost}' not found`)
      this.error(message)
    }

    return (await response.json()) as StaticHost
  }
}
