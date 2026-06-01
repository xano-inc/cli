import {Args, Flags} from '@oclif/core'

import BaseCommand, {type ProfileConfig} from '../../../base-command.js'

export interface StaticHostEnv {
  canonical?: null | string
  mode?: null | string
}

export interface StaticHost {
  dev?: StaticHostEnv
  id: number
  name: string
  prod?: StaticHostEnv
}

export default class StaticHostMigrate extends BaseCommand {
  static args = {
    static_host: Args.string({
      description: 'Static Host name to migrate (omit when using --all)',
      required: false,
    }),
  }
  static description =
    'Migrate a static host to instance-managed (v2) hosting. Reparents the Ingress, verifies it, clears master, and marks the host v2.'
  static examples = [
    `$ xano static_host migrate newsite
Migrated 'newsite' to v2
`,
    `$ xano static_host migrate newsite --env dev
Migrated 'newsite' (dev) to v2
`,
    `$ xano static_host migrate --all
Migrating 3 v1 host(s)...
  ✓ newsite
  ✓ marketing
  ✗ legacy — <error>
`,
    `$ xano static_host migrate --all --dry-run
Would migrate 3 v1 host(s): newsite, marketing, legacy
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    all: Flags.boolean({
      default: false,
      description: 'Migrate every host still on v1 in the workspace',
      required: false,
    }),
    'dry-run': Flags.boolean({
      default: false,
      description: 'List the hosts that would be migrated without changing anything',
      required: false,
    }),
    env: Flags.string({
      description: 'Which environment to migrate (migrates both if omitted)',
      options: ['dev', 'prod'],
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
    const {args, flags} = await this.parse(StaticHostMigrate)

    if (!flags.all && !args.static_host) {
      this.error('Provide a static host name, or use --all to migrate every v1 host.')
    }

    if (flags.all && args.static_host) {
      this.error('Use either a static host name or --all, not both.')
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
          `  1. Provide it as a flag: xano static_host migrate <static_host> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    if (flags.all) {
      await this.migrateAll(profile, workspaceId, flags)
      return
    }

    await this.migrateOne(profile, workspaceId, args.static_host as string, flags)
  }

  /** List all static hosts in the workspace (paginates until exhausted). */
  private async listHosts(profile: ProfileConfig, workspaceId: string, verbose: boolean): Promise<StaticHost[]> {
    const hosts: StaticHost[] = []
    const perPage = 100
    for (let page = 1; ; page++) {
      const listUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host?page=${page}&per_page=${perPage}`

      // eslint-disable-next-line no-await-in-loop
      const response = await this.verboseFetch(
        listUrl,
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
        const errorText = await response.text() // eslint-disable-line no-await-in-loop
        this.error(`Failed to list static hosts: ${response.status} ${response.statusText}\n${errorText}`)
      }

      const data = (await response.json()) as StaticHost[] | {items?: StaticHost[]} // eslint-disable-line no-await-in-loop
      const pageHosts: StaticHost[] = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)
          ? data.items
          : []

      hosts.push(...pageHosts)
      if (pageHosts.length < perPage) break
    }

    return hosts
  }

  /** Discover v1 hosts and migrate each, with a per-host report. */
  private async migrateAll(
    profile: ProfileConfig,
    workspaceId: string,
    flags: {'dry-run': boolean; env?: string; output: string; verbose: boolean},
  ): Promise<void> {
    const hosts = await this.listHosts(profile, workspaceId, flags.verbose)
    const v1Hosts = hosts.filter((h) => isV1(h, flags.env))

    if (v1Hosts.length === 0) {
      this.log('No v1 hosts to migrate — all hosts are already instance-managed (v2).')
      return
    }

    if (flags['dry-run']) {
      const names = v1Hosts.map((h) => h.name)
      if (flags.output === 'json') {
        this.log(JSON.stringify({dryRun: true, wouldMigrate: names}, null, 2))
      } else {
        this.log(`Would migrate ${names.length} v1 host(s): ${names.join(', ')}`)
      }

      return
    }

    if (flags.output !== 'json') {
      this.log(`Migrating ${v1Hosts.length} v1 host(s)...`)
    }

    const results: Array<{error?: string; migrated: boolean; static_host: string}> = []
    for (const host of v1Hosts) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.migrateHost(profile, workspaceId, host.name, flags.env, flags.verbose)
        results.push({migrated: true, static_host: host.name})
        if (flags.output !== 'json') this.log(`  ✓ ${host.name}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        results.push({error: message, migrated: false, static_host: host.name})
        if (flags.output !== 'json') this.log(`  ✗ ${host.name} — ${message}`)
      }
    }

    if (flags.output === 'json') {
      this.log(JSON.stringify({results}, null, 2))
    } else {
      const ok = results.filter((r) => r.migrated).length
      const failed = results.length - ok
      this.log(`Done: ${ok} migrated${failed > 0 ? `, ${failed} failed` : ''}.`)
    }
  }

  /** POST the meta migrate endpoint for one host. Throws on a non-OK response. */
  private async migrateHost(
    profile: ProfileConfig,
    workspaceId: string,
    staticHost: string,
    env: string | undefined,
    verbose: boolean,
  ): Promise<Record<string, unknown>> {
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${staticHost}/migrate`

    const response = await this.verboseFetch(
      apiUrl,
      {
        body: JSON.stringify(env ? {env} : {}),
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${profile.access_token}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
      verbose,
      profile.access_token,
    )

    if (!response.ok) {
      const message = await this.parseApiError(response, `Migrate failed for '${staticHost}'`)
      throw new Error(message)
    }

    return (await response.json()) as Record<string, unknown>
  }

  /** Migrate a single named host and report the result. */
  private async migrateOne(
    profile: ProfileConfig,
    workspaceId: string,
    staticHost: string,
    flags: {env?: string; output: string; verbose: boolean},
  ): Promise<void> {
    const result = await this.migrateHost(profile, workspaceId, staticHost, flags.env, flags.verbose)

    const envSuffix = flags.env ? ` (${flags.env})` : ''
    if (flags.output === 'json') {
      this.log(JSON.stringify({env: flags.env ?? null, migrated: true, static_host: staticHost, ...result}, null, 2))
    } else {
      this.log(`Migrated '${staticHost}'${envSuffix} to v2`)
    }
  }
}

/** An env still needs migration when it's been deployed (has a canonical) but isn't yet v2. */
export function envNeedsMigration(e?: StaticHostEnv): boolean {
  return Boolean(e?.canonical) && e?.mode !== 'v2'
}

/**
 * A host still needs migration when an env of interest is v1. When --env is given,
 * only that env is considered; otherwise either env being v1 qualifies the host.
 */
export function isV1(host: StaticHost, env?: string): boolean {
  if (env === 'dev') return envNeedsMigration(host.dev)
  if (env === 'prod') return envNeedsMigration(host.prod)
  return envNeedsMigration(host.dev) || envNeedsMigration(host.prod)
}
