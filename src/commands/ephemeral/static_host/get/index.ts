import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

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

export default class EphemeralStaticHostGet extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name',
      required: true,
    }),
  }
  static description = 'Get a single static host\'s details (name, git config, dev/prod environments) for an ephemeral tenant'
  static examples = [
    `$ xano ephemeral static_host get e4f2-9ab1-xyz1 --static-host newsite
Static Host: newsite
ID: 5
Dev: https://newsite-dev-....dev.xano.io (v2)
`,
    `$ xano ephemeral static_host get e4f2-9ab1-xyz1 -H newsite -w 40 -o json`,
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
    'static-host': Flags.string({
      char: 'H',
      description: 'Static host name',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralStaticHostGet)

    const {profile, profileName} = this.resolveProfile(flags)

    const tenantName = args.tenant_name

    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano ephemeral static_host get <tenant_name> --static-host <static_host> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    const staticHost = flags['static-host']
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/static_host/${staticHost}`

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
        const message = await this.parseApiError(response, `Failed to get static host '${staticHost}'`)
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
