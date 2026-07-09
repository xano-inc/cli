import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

interface ProfileConfig {
  access_token: string
  account_origin?: string
  branch?: string
  instance_origin: string
  workspace?: string
}

interface ParsedFile {
  content: string
  encoding?: string
  path: string
}

export interface StaticHostEnv {
  canonical?: null | string
}

export interface StaticHostSummary {
  [k: string]: unknown
  dev?: StaticHostEnv
  name: string
  prod?: StaticHostEnv
}

export interface BuildSummary {
  canonical?: string
  id: number
}

/**
 * Find the deployed `canonical` for a static host's env from a list of hosts.
 * Returns null when the host isn't present or nothing is deployed to that env.
 */
export function extractEnvCanonical(
  hosts: StaticHostSummary[],
  staticHost: string,
  env: string,
): null | string {
  const host = hosts.find((h) => h.name === staticHost)
  if (!host) {
    return null
  }

  const envObj = host[env] as StaticHostEnv | undefined
  return envObj?.canonical ?? null
}

/** Find the build whose unique `canonical` matches, or null if none do. */
export function findBuildByCanonical(builds: BuildSummary[], canonical: string): BuildSummary | null {
  return builds.find((b) => b.canonical === canonical) ?? null
}

export default class StaticHostBuildPull extends BaseCommand {
  static args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
  }
  static description = 'Pull a static host build to disk. Defaults to the original uploaded source (including package.json); use --source built for the compiled/served output.'
  static examples = [
    `$ xano static_host build pull default --build_id 52
Pulled 15 files to current directory
`,
    `$ xano static_host build pull default --build_id 52 -d ./output
Pulled 15 files to ./output
`,
    `$ xano static_host build pull myhost --build_id 123 -w 40
Pulled 8 files to current directory
`,
    `$ xano static_host build pull default --latest
Pulled 22 files to current directory
`,
    `$ xano static_host build pull default --env dev
Pulled 18 files to current directory
`,
    `$ xano static_host build pull default --env prod -d ./prod-release
Pulled 18 files to ./prod-release
`,
    `$ xano static_host build pull default --build_id 52 --source built
Pulled the compiled/served output instead of the original source
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    build_id: Flags.string({
      description: 'Build ID to pull',
      exclusive: ['latest', 'env'],
      required: false,
    }),
    directory: Flags.string({
      char: 'd',
      default: '.',
      description: 'Output directory for pulled files (defaults to current directory)',
      required: false,
    }),
    env: Flags.string({
      description: 'Pull the build currently deployed to this environment',
      exclusive: ['build_id', 'latest'],
      options: ['dev', 'prod'],
      required: false,
    }),
    latest: Flags.boolean({
      default: false,
      description: 'Pull the latest build',
      exclusive: ['build_id', 'env'],
      required: false,
    }),
    source: Flags.string({
      default: 'original',
      description: 'Which files to pull: "original" (the uploaded source, including package.json) or "built" (the compiled/served output)',
      options: ['original', 'built'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StaticHostBuildPull)

    if (!flags.build_id && !flags.latest && !flags.env) {
      this.error('One of --build_id <id>, --latest, or --env <dev|prod> is required')
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
        `  1. Provide it as a flag: xano static_host build pull <static_host> --build_id <id> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    let buildId: string
    if (flags.build_id) {
      buildId = flags.build_id
    } else if (flags.env) {
      buildId = await this.resolveEnvBuild({
        env: flags.env,
        profile,
        staticHost: args.static_host,
        verbose: flags.verbose,
        workspaceId,
      })
    } else {
      buildId = await this.resolveLatestBuild(profile, workspaceId, args.static_host, flags.verbose)
    }

    // Default is "original" (the uploaded source); only append the param when
    // pulling the built output, so default requests stay clean.
    const query = flags.source === 'built' ? '?source=built' : ''
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}/build/${buildId}/multidoc${query}`

    let responseText: string
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

      responseText = await response.text()
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch build multidoc: ${error.message}`)
      } else {
        this.error(`Failed to fetch build multidoc: ${String(error)}`)
      }
    }

    if (!responseText.trim()) {
      this.log('No files found in build')
      return
    }

    const rawDocuments = responseText.split('\n---\n')
    const files: ParsedFile[] = []

    for (const raw of rawDocuments) {
      const trimmed = raw.trim()
      if (!trimmed) continue

      const parsed = this.parseFileDocument(trimmed)
      if (parsed) {
        files.push(parsed)
      }
    }

    if (files.length === 0) {
      this.log('No files found in response')
      return
    }

    const outputDir = path.resolve(flags.directory)
    fs.mkdirSync(outputDir, {recursive: true})

    let writtenCount = 0
    for (const file of files) {
      const filePath = path.resolve(outputDir, file.path)
      if (!filePath.startsWith(outputDir + path.sep) && filePath !== outputDir) {
        this.warn(`Skipping file with path outside output directory: ${file.path}`)
        continue
      }

      const fileDir = path.dirname(filePath)

      fs.mkdirSync(fileDir, {recursive: true})

      if (file.encoding === 'base64') {
        const buffer = Buffer.from(file.content, 'base64')
        fs.writeFileSync(filePath, buffer)
      } else {
        fs.writeFileSync(filePath, file.content, 'utf8')
      }

      writtenCount++
    }

    this.log(`Pulled ${writtenCount} files to ${flags.directory}`)
  }

  private parseFileDocument(raw: string): null | ParsedFile {
    const lines = raw.split('\n')
    const firstLine = lines[0]

    if (!firstLine.startsWith('path: ')) {
      return null
    }

    const filePath = firstLine.slice('path: '.length).trim()

    if (lines.length > 1 && lines[1] === 'encoding: base64') {
      const content = lines.slice(2).join('\n')
      return {content, encoding: 'base64', path: filePath}
    }

    const content = lines.slice(1).join('\n')
    return {content, path: filePath}
  }

  /**
   * Resolve the build ID currently deployed to a static host's dev/prod env.
   *
   * The deployed env stores the `canonical` of the build it was created from
   * (static_host.{env}.canonical). Each build carries that same unique
   * `canonical`, so we match the env's canonical against the build list to
   * recover the build ID — a shortcut for "list builds, find the deployed one,
   * then pull it".
   */
  private async resolveEnvBuild(opts: {
    env: string
    profile: ProfileConfig
    staticHost: string
    verbose: boolean
    workspaceId: string
  }): Promise<string> {
    const {env, profile, staticHost, verbose, workspaceId} = opts
    // 1. Look up the static host to read the deployed canonical for this env.
    const hostUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host`

    const hostResponse = await this.verboseFetch(
      hostUrl,
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

    if (!hostResponse.ok) {
      const errorText = await hostResponse.text()
      this.error(`Failed to list static hosts: ${hostResponse.status} ${hostResponse.statusText}\n${errorText}`)
    }

    const hostData = (await hostResponse.json()) as StaticHostSummary[] | {items?: StaticHostSummary[]}
    const hosts: StaticHostSummary[] = Array.isArray(hostData)
      ? hostData
      : hostData && typeof hostData === 'object' && 'items' in hostData && Array.isArray(hostData.items)
        ? hostData.items
        : []

    const canonical = extractEnvCanonical(hosts, staticHost, env)
    if (!canonical) {
      if (!hosts.some((h) => h.name === staticHost)) {
        this.error(`Static host '${staticHost}' not found`)
      }

      this.error(`No build is deployed to the '${env}' environment of static host '${staticHost}'`)
    }

    // 2. Page through builds to find the one matching the deployed canonical.
    const perPage = 100
    for (let page = 1; ; page++) {
      const listUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${staticHost}/build?page=${page}&per_page=${perPage}`

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
        // eslint-disable-next-line no-await-in-loop
        const errorText = await response.text()
        this.error(`Failed to list builds: ${response.status} ${response.statusText}\n${errorText}`)
      }

      // eslint-disable-next-line no-await-in-loop
      const data = (await response.json()) as BuildSummary[] | {items?: BuildSummary[]}
      const builds: BuildSummary[] = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)
          ? data.items
          : []

      const match = findBuildByCanonical(builds, canonical)
      if (match) {
        return String(match.id)
      }

      if (builds.length < perPage) {
        // Reached the last page without a match.
        this.error(
          `Could not find the build deployed to '${env}' (canonical ${canonical}) in the build list for '${staticHost}'`,
        )
      }
    }
  }

  private async resolveLatestBuild(
    profile: ProfileConfig,
    workspaceId: string,
    staticHost: string,
    verbose: boolean,
  ): Promise<string> {
    const listUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${staticHost}/build?page=1&per_page=1`

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
      const errorText = await response.text()
      this.error(`Failed to list builds: ${response.status} ${response.statusText}\n${errorText}`)
    }

    const data = await response.json() as {id: number}[] | {items?: {id: number}[]}
    const builds: {id: number}[] = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)
        ? data.items
        : []

    if (builds.length === 0) {
      this.error(`No builds found for static host '${staticHost}'`)
    }

    return String(builds[0].id)
  }
}
