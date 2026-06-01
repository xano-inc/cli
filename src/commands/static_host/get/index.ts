import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface StaticHostEnv {
  canonical?: null | string
  custom_url?: null | string
  default_url?: null | string
  mode?: null | string
}

interface StaticHost {
  [key: string]: unknown
  created_at?: number | string
  description?: string
  dev?: StaticHostEnv
  git?: {public_key?: string; repo?: string}
  id: number
  name: string
  prod?: StaticHostEnv
}

export default class StaticHostGet extends BaseCommand {
  static args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
  }
  static description = 'Get a single static host\'s details (name, git config, dev/prod environments)'
  static examples = [
    `$ xano static_host get newsite
Static Host: newsite
ID: 5
Dev: https://newsite-dev-....dev.xano.io (v2)
`,
    `$ xano static_host get newsite -w 40 -o json`,
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
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StaticHostGet)

    const {profile, profileName} = this.resolveProfile(flags)

    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano static_host get <static_host> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}`

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
        const message = await this.parseApiError(response, `Failed to get static host '${args.static_host}'`)
        this.error(message)
      }

      const host = (await response.json()) as StaticHost

      if (flags.output === 'json') {
        this.log(JSON.stringify(host, null, 2))
      } else {
        this.log(`Static Host: ${host.name}`)
        this.log(`ID: ${host.id}`)
        if (host.description) this.log(`Description: ${host.description}`)
        if (host.git?.repo) this.log(`Git: ${host.git.repo}`)
        this.logEnv('Dev', host.dev)
        this.logEnv('Prod', host.prod)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get static host: ${error.message}`)
      } else {
        this.error(`Failed to get static host: ${String(error)}`)
      }
    }
  }

  /** Print a one-line summary for a dev/prod env if it has been deployed. */
  private logEnv(label: string, env?: StaticHostEnv): void {
    if (!env?.default_url) return
    const modeInfo = env.mode ? ` (${env.mode})` : ''
    const custom = env.custom_url ? ` [custom: ${env.custom_url}]` : ''
    this.log(`${label}: ${env.default_url}${modeInfo}${custom}`)
  }
}
