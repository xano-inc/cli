import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import {resolve} from 'node:path'

import type {ProfileConfig} from '../../../base-command.js'

import BaseCommand from '../../../base-command.js'
import {
  buildDebugQuery,
  DEBUG_ENTRY_TYPES,
  type DebugRunEnvelope,
  type DocumentEntry,
  findEntryInDocs,
  isUuid,
  partitionEnvDocs,
  renderDebugRunSummary,
} from '../../../utils/debug-run.js'
import {assembleInput, type JsonObject, loadJsonSource, parseDataPairs} from '../../../utils/function-input.js'
import {applyFilters, collectFiles, describeNetworkError, readDocuments} from '../../../utils/multidoc-push.js'

/** Parsed flags this command's private helpers care about. */
interface DebugRunFlags {
  branch?: string
  'bypass-size-limit': boolean
  data?: string[]
  'debug-id'?: string
  dir: string
  env: boolean
  exclude?: string[]
  include?: string[]
  json?: string
  name: string
  output: string
  stdin: boolean
  type: string
  verb?: string
  verbose: boolean
  workspace?: string
}

export default class DebugRun extends BaseCommand {
  static override description =
    'Run one object from your local workspace files in an isolated debug environment. ' +
    'Builds the multidoc from local .xs files (like workspace push), executes the named entry object in a throwaway schema, ' +
    'and prints a compact result envelope. The full per-statement stack is stored server-side under a debug id — fetch it with `xano debug get`. ' +
    'Exit codes: 0 = run ok, 1 = run completed with an exception, 2 = usage/HTTP errors.'
  static override examples = [
    `$ xano debug run --type function --name calcScore --data email=jo@x.com --data age:=30`,
    `$ xano debug run --type query --name /users --verb GET --json @payload.json -o json | jq .result`,
    `$ xano debug run --type task --name nightly_sync --dir ./my-workspace -i "function/*" -i "task/*"`,
    `$ xano debug run --type function --name slowJob --debug-id 018f3a6e-1111-4222-8333-444455556666
# Pre-supplied uuid: if the response is lost to a timeout, recover with xano debug get <id>`,
    `$ xano debug run --type function --name calcScore --no-env
# Run without folding local env values into the debug workspace`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      description: 'Branch to run from (defaults to profile branch, then live)',
      required: false,
    }),
    'bypass-size-limit': Flags.boolean({
      default: false,
      description:
        'Capture values over the per-value size cap instead of replacing them with {{too_large}} markers (inflates the stored payload)',
      required: false,
    }),
    data: Flags.string({
      char: 'd',
      description: 'Input field as key=value (string), key:=json (raw JSON), or key@file (file contents). Repeatable.',
      multiple: true,
      required: false,
    }),
    'debug-id': Flags.string({
      description:
        'Pre-supplied uuid for the stored result. Lets you recover a long run with `xano debug get <id>` if the response is lost to a timeout.',
      required: false,
    }),
    dir: Flags.string({
      default: '.',
      description: 'Directory containing the local .xs workspace files (defaults to current directory)',
      required: false,
    }),
    env: Flags.boolean({
      allowNo: true,
      default: true,
      description:
        'Include local env-bearing workspace documents so $env values resolve in the debug run (use --no-env to omit them)',
      required: false,
    }),
    exclude: Flags.string({
      char: 'e',
      description:
        'Glob pattern to exclude files (e.g. "table/*", "**/test*"). Matched against relative paths from the source directory.',
      multiple: true,
      required: false,
    }),
    include: Flags.string({
      char: 'i',
      description:
        'Glob pattern to include files (e.g. "**/func*", "table/*.xs"). Matched against relative paths from the source directory.',
      multiple: true,
      required: false,
    }),
    json: Flags.string({
      description: "Input as a JSON object: inline, @file.json, or '-' for stdin",
      exclusive: ['stdin'],
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Name of the entry object to run (e.g. calcScore, /users)',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    stdin: Flags.boolean({
      char: 's',
      default: false,
      description: 'Read the input JSON object from stdin (same as --json -)',
      exclusive: ['json'],
      required: false,
    }),
    type: Flags.string({
      char: 't',
      description: 'Type of the entry object to run',
      options: [...DEBUG_ENTRY_TYPES],
      required: true,
    }),
    verb: Flags.string({
      description: 'HTTP verb disambiguator for query entries (e.g. GET, POST)',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(DebugRun)
    const {profile, profileName} = this.resolveProfile(flags)

    const workspaceId = this.resolveWorkspaceId(flags, profile, profileName)
    const branch = flags.branch ?? profile.branch ?? ''
    const debugId = flags['debug-id']

    if (debugId && !isUuid(debugId)) {
      this.error(`--debug-id must be a uuid (8-4-4-4-12 hex), got '${debugId}'`, {exit: 2})
    }

    const entries = this.collectEntries(flags)
    const multidoc = entries.map((d) => d.content).join('\n---\n')
    const input = this.assembleRunInput(flags)
    this.preflightEntryCheck(entries, flags)

    const query = buildDebugQuery({
      branch,
      bypassSizeLimit: flags['bypass-size-limit'],
      debugId,
      entryObjName: flags.name,
      entryObjType: flags.type,
      entryObjVerb: flags.verb,
      input,
    })
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/multidoc/debug?${query.toString()}`
    const envelope = await this.executeDebug(apiUrl, multidoc, profile, flags)

    if (flags.output === 'json') {
      this.log(JSON.stringify(envelope, null, 2))
    } else {
      for (const line of renderDebugRunSummary(envelope)) {
        this.log(line)
      }
    }

    if (envelope.status && envelope.status !== 'ok') {
      this.exit(1)
    }
  }

  /** Assemble the input object from the JSON base + --data overrides. */
  private assembleRunInput(flags: DebugRunFlags): JsonObject {
    try {
      const jsonSource = flags.stdin ? '-' : flags.json
      const jsonBase = loadJsonSource(jsonSource, {stdin: () => this.readStdinSync()})
      return assembleInput({dataPairs: parseDataPairs(flags.data ?? []), jsonBase})
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error), {exit: 2})
    }
  }

  /**
   * Collect the local multidoc entries the same way `workspace push` does
   * (recursive .xs collection + include/exclude globs), then apply the env-doc
   * policy: the debug workspace is built solely from the uploaded multidoc, so
   * $env values only resolve when env-bearing documents are included.
   */
  private collectEntries(flags: DebugRunFlags): DocumentEntry[] {
    // Informational lines are suppressed in json mode so stdout stays pipeable
    // (`-o json | jq .result`) — same convention as the local-profile banner.
    const notify: (msg: string) => void = flags.output === 'json' ? () => {} : this.log.bind(this)

    const inputDir = resolve(flags.dir)
    if (!fs.existsSync(inputDir)) {
      this.error(`Directory not found: ${inputDir}`, {exit: 2})
    }

    if (!fs.statSync(inputDir).isDirectory()) {
      this.error(`Not a directory: ${inputDir}`, {exit: 2})
    }

    const allFiles = collectFiles(inputDir)
    const files = applyFilters(allFiles, inputDir, flags.include, flags.exclude, notify)

    if (files.length === 0) {
      this.error(
        flags.include || flags.exclude
          ? `No .xs files remain after include/exclude filters in ${inputDir}`
          : `No .xs files found in ${inputDir}`,
        {exit: 2},
      )
    }

    const entries = readDocuments(files)
    if (entries.length === 0) {
      this.error(`All .xs files in ${inputDir} are empty`, {exit: 2})
    }

    const {envEntries, rest} = partitionEnvDocs(entries)
    if (envEntries.length === 0) {
      return entries
    }

    if (flags.env) {
      notify(
        `Including ${envEntries.length} env-bearing document(s) — $env values will be available to the debug run (use --no-env to omit).`,
      )
      return entries
    }

    notify(`Omitting ${envEntries.length} env-bearing document(s) (--no-env); $env reads will return nothing.`)
    if (rest.length === 0) {
      this.error(`No documents remain after omitting env-bearing documents in ${inputDir}`, {exit: 2})
    }

    return rest
  }

  /** POST the multidoc and return the parsed envelope; all failures exit 2. */
  private async executeDebug(
    apiUrl: string,
    multidoc: string,
    profile: ProfileConfig,
    flags: DebugRunFlags,
  ): Promise<DebugRunEnvelope> {
    const debugId = flags['debug-id']
    const startTime = Date.now()
    const response = await this.verboseFetch(
      apiUrl,
      {
        body: multidoc,
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
          'Content-Type': 'text/x-xanoscript',
        },
        method: 'POST',
      },
      flags.verbose,
      profile.access_token,
    ).catch((error: unknown) => {
      let message = `Failed to run debug: ${describeNetworkError(error, apiUrl, Date.now() - startTime)}`
      if (debugId) {
        message += `\nThe run may still complete server-side. Recover the stored result with: xano debug get ${debugId}`
      }

      this.error(message, {exit: 2})
    })

    if (response.status === 409) {
      // A caller-supplied debug id already has a stored result; the run was
      // rejected before executing anything — fetch the existing result instead.
      const message = await this.parseApiError(response, 'Debug run rejected')
      this.error(`${message}\nFetch the stored result with: xano debug get ${debugId}`, {exit: 2})
    }

    if (!response.ok) {
      const message = await this.parseApiError(response, 'Failed to run debug')
      this.error(message, {exit: 2})
    }

    return (await response.json()) as DebugRunEnvelope
  }

  /** Warn (never block) when the requested entry isn't in the collected docs. */
  private preflightEntryCheck(entries: DocumentEntry[], flags: DebugRunFlags): void {
    const {found, suggestions} = findEntryInDocs(entries, flags.type, flags.name, flags.verb)
    if (found) return

    const where = flags.verb ? `${flags.type} '${flags.name}' verb=${flags.verb}` : `${flags.type} '${flags.name}'`
    let warning = `No local document matches ${where}; the server will reject the run if it isn't in the uploaded multidoc.`
    if (suggestions.length > 0) {
      warning += ` Closest local matches: ${suggestions.join(', ')}`
    }

    this.warn(warning)
  }

  private readStdinSync(): string {
    // Synchronous read of all of stdin (fd 0); only reached when the user
    // explicitly passed --stdin or --json -, so this never hangs a non-TTY run.
    try {
      return fs.readFileSync(0, 'utf8')
    } catch (error) {
      this.error(`Failed to read from stdin: ${error instanceof Error ? error.message : String(error)}`, {exit: 2})
    }
  }

  private resolveWorkspaceId(flags: {workspace?: string}, profile: ProfileConfig, profileName: string): string {
    if (flags.workspace) return flags.workspace
    if (profile.workspace) return profile.workspace
    this.error(
      `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano debug run --type <type> --name <name> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      {exit: 2},
    )
  }
}
