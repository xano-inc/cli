import {Args, Flags} from '@oclif/core'
import {readFileSync} from 'node:fs'

import type {ProfileConfig} from '../../../base-command.js'

import BaseCommand from '../../../base-command.js'
import {
  assembleInput,
  type FunctionInputParam,
  type JsonObject,
  loadJsonSource,
  parseDataPairs,
  validateAgainstSchema,
} from '../../../utils/function-input.js'

interface RunFunctionResponse {
  [key: string]: unknown
  logs?: unknown[]
  result?: unknown
  status?: string
}

interface FunctionListItem {
  id: number
  input?: FunctionInputParam[]
  name: string
}

export default class FunctionRun extends BaseCommand {
  static args = {
    name: Args.string({
      description: 'Name of the function to run (interactive if omitted with --name unset)',
      required: false,
    }),
  }
static description =
    '[IMPORTANT] ALWAYS confirm with the user before running a function; it executes against the live workspace/branch and may mutate data or call external services. Run (execute) a named function in a workspace and print its result.'
static examples = [
    `$ xano function:run calcScore -w 40
# Prompts for any declared inputs, then runs the function`,
    `$ xano function:run calcScore --data email=jo@x.com --data age:=30 --data active:=true`,
    `$ xano function:run calcScore --json @payload.json --data env=staging`,
    `$ echo '{"email":"jo@x.com"}' | xano function:run calcScore --stdin -o json | jq .result`,
    `$ xano function:run calcScore --branch dev --logs`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      description: 'Branch to run from (defaults to profile branch, then main)',
      required: false,
    }),
    data: Flags.string({
      char: 'd',
      description: 'Input field as key=value (string), key:=json (raw JSON), or key@file (file contents). Repeatable.',
      multiple: true,
      required: false,
    }),
    json: Flags.string({
      description: "Input as a JSON object: inline, @file.json, or '-' for stdin",
      exclusive: ['stdin'],
      required: false,
    }),
    logs: Flags.boolean({
      default: false,
      description: 'Print the execution logs returned by the debugger',
      required: false,
    }),
    'name': Flags.string({
      char: 'n',
      description: 'Name of the function to run (alternative to the positional argument)',
      required: false,
    }),
    'no-input-check': Flags.boolean({
      default: false,
      description: 'Skip local schema validation and interactive prompting; send the payload as-is',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'json',
      description: 'Output format',
      options: ['json', 'summary'],
      required: false,
    }),
    stdin: Flags.boolean({
      char: 's',
      default: false,
      description: "Read the input JSON object from stdin (same as --json -)",
      exclusive: ['json'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionRun)
    const {profile, profileName} = this.resolveProfile(flags)

    const functionName = args.name ?? flags.name
    if (!functionName) {
      this.error('A function name is required. Provide it as an argument or with --name.')
    }

    const workspaceId = this.resolveWorkspaceId(flags, profile, profileName)
    const branch = flags.branch ?? profile.branch ?? ''

    // 1) Assemble the input object from JSON base + --data overrides.
    const jsonSource = flags.stdin ? '-' : flags.json
    const jsonBase = loadJsonSource(jsonSource, {stdin: () => this.readStdinSync()})
    let input = assembleInput({dataPairs: parseDataPairs(flags.data ?? []), jsonBase})

    // 2) Introspect the function's declared inputs (best-effort) to validate,
    //    warn on obvious mismatches, and prompt for missing required params.
    if (!flags['no-input-check']) {
      const fn = await this.fetchFunctionByName({
        branch,
        name: functionName,
        profile,
        verbose: flags.verbose,
        workspaceId,
      })
      const schema = fn?.input
      const {missingRequired, warnings} = validateAgainstSchema(input, schema)

      for (const w of warnings) this.warn(w)

      if (missingRequired.length > 0) {
        input = await this.promptForMissing(input, missingRequired)
      }
    }

    // 3) Execute via the meta run endpoint.
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/function/run`
    const body: JsonObject = {input, name: functionName}
    if (branch) body.branch = branch

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
      const message = await this.parseApiError(response, 'Failed to run function')
      this.error(message)
    }

    const result = (await response.json()) as RunFunctionResponse
    this.emitResult(result, flags.output, flags.logs)

    // 4) Compose in scripts/CI: non-zero exit when the function errored.
    if (result.status && result.status !== 'ok') {
      this.exit(1)
    }
  }

  private emitResult(result: RunFunctionResponse, output: string, showLogs: boolean): void {
    if (output === 'json') {
      // Raw result object so `| jq .result` works predictably.
      this.log(JSON.stringify(result.result ?? null, null, 2))
    } else {
      const status = result.status ?? 'ok'
      this.log(`Status: ${status}`)
      this.log('Result:')
      this.log(JSON.stringify(result.result ?? null, null, 2))
    }

    if (showLogs && Array.isArray(result.logs) && result.logs.length > 0) {
      this.log('')
      this.log('Logs:')
      for (const entry of result.logs) {
        this.log(typeof entry === 'string' ? entry : JSON.stringify(entry))
      }
    }
  }

  /**
   * Fetch a single function record by name via the list endpoint's search,
   * returning the exact-name match (so `calc` doesn't accidentally match
   * `calcScore`). Best-effort: returns undefined and warns on any failure so a
   * transient introspection problem never blocks an otherwise-valid run.
   */
  private async fetchFunctionByName(opts: {
    branch: string
    name: string
    profile: ProfileConfig
    verbose: boolean
    workspaceId: string
  }): Promise<FunctionListItem | undefined> {
    const {branch, name, profile, verbose, workspaceId} = opts
    // eslint-disable-next-line camelcase -- external Metadata API query param
    const params = new URLSearchParams({per_page: '100', search: name})
    if (branch) params.set('branch', branch)
    const url = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/function?${params.toString()}`

    try {
      const response = await this.verboseFetch(
        url,
        {headers: {accept: 'application/json', Authorization: `Bearer ${profile.access_token}`}, method: 'GET'},
        verbose,
        profile.access_token,
      )
      if (!response.ok) return undefined

      const page = (await response.json()) as FunctionListItem[] | {items?: FunctionListItem[]}
      const items = Array.isArray(page) ? page : (page.items ?? [])
      const exact = items.filter((f) => f.name === name)

      if (exact.length > 1) {
        this.warn(`Multiple functions named '${name}' found; skipping input validation.`)
        return undefined
      }

      return exact[0]
    } catch {
      // Introspection is a convenience, not a requirement.
      return undefined
    }
  }

  /**
   * Prompt for each missing required input on an interactive TTY. Values are
   * read as raw JSON when they parse as such (so numbers/bools/objects work),
   * otherwise treated as a string — mirroring the `key:=`/`key=` distinction.
   * Non-TTY: fail fast with the list of missing params (never hang on a prompt).
   */
  private async promptForMissing(input: JsonObject, missing: FunctionInputParam[]): Promise<JsonObject> {
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      const names = missing.map((p) => `${p.name}${p.type ? ` (${p.type})` : ''}`).join(', ')
      this.error(
        `Missing required input: ${names}. ` +
          `Provide via --data/--json, or run interactively in a terminal.`,
      )
    }

    const readline = await import('node:readline')
    const rl = readline.createInterface({input: process.stdin, output: process.stdout})
    const ask = (message: string): Promise<string> =>
      new Promise((resolve) => {
        rl.question(message, resolve)
      })

    const filled: JsonObject = {...input}
    try {
      for (const param of missing) {
        const hint = [param.type, param.description].filter(Boolean).join(' — ')
        // eslint-disable-next-line no-await-in-loop
        const raw = await ask(`${param.name}${hint ? ` (${hint})` : ''}: `)
        filled[param.name] = coercePromptValue(raw, param)
      }
    } finally {
      rl.close()
    }

    return filled
  }

  private readStdinSync(): string {
    // Synchronous read of all of stdin (fd 0); used for --json - / --stdin.
    try {
      return readFileSync(0, 'utf8')
    } catch (error) {
      this.error(`Failed to read from stdin: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private resolveWorkspaceId(flags: {workspace?: string}, profile: ProfileConfig, profileName: string): string {
    if (flags.workspace) return flags.workspace
    if (profile.workspace) return profile.workspace
    this.error(
      `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano function:run <name> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
    )
  }
}

/**
 * Coerce a prompted string into the value the parameter likely expects. Non-text
 * params attempt a JSON parse (so `30`, `true`, `["a"]` become typed values);
 * text params keep the raw string. Falls back to the raw string on parse errors.
 */
function coercePromptValue(raw: string, param: FunctionInputParam): unknown {
  const isTextLike = !param.type || param.type === 'text' || param.type === 'uuid'
  if (isTextLike) return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
