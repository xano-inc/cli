import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'

import BaseCommand, {type ProfileConfig} from './base-command.js'
import {foldApiError, formatApiError} from './utils/api_error.js'
import {policyPermissionGuidance} from './utils/policy-permission.js'
import {
  computeStatusRows,
  enforcementLabel,
  type Policy,
  type PolicyCatalogueEntry,
  policyCatalogueSummary,
  type PolicyCheck,
  policyCheckWarning,
  policyExitCode,
  policyResultSummary,
  type PolicyRun,
  policyRunDetail,
  policyRunRow,
  policyRunSummary,
  policySummary,
  selectCatalogueCheck,
  statusExitCode,
  statusExitReason,
} from './utils/policy.js'

interface PolicyFlags {
  branch?: string
  check?: string
  config?: string
  'fail-on-findings'?: boolean
  file?: string
  force?: boolean
  limit?: number
  message?: string
  output?: string
  profile?: string
  'run-detail'?: boolean
  stdin?: boolean
  verbose: boolean
  workspace?: string
}

type PolicyRequest = (path?: string, method?: string, body?: unknown, query?: Record<string, string>) => Promise<unknown>

interface PolicyContext {
  branch: string
  flags: PolicyFlags
  request: PolicyRequest
  workspace: string
}

function list<T = Policy>(data: unknown): T[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) return data.items
  throw new Error('Unexpected policy list response.')
}

function isSavedPolicy(saved: unknown, key: string): boolean {
  if (!saved || typeof saved !== 'object' || !('id' in saved) || !('key' in saved)) return false
  return Number.isSafeInteger(saved.id) && Number(saved.id) > 0 && saved.key === key
}

export default abstract class PolicyCommand extends BaseCommand {
  static policyFlags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({char: 'b', description: "Branch label (defaults to profile branch or live; -b '' selects live)"}),
    output: Flags.string({char: 'o', default: 'summary', description: 'Output format', options: ['summary', 'json']}),
    workspace: Flags.string({char: 'w', description: 'Workspace ID (defaults to profile workspace)'}),
  }
  /** Only `publish` writes, so only `publish` can label a Version History entry. */
  static publishFlags = {
    message: Flags.string({char: 'm', description: 'Message stored on the Version History entry this save creates'}),
  }
  /** One positional, as CLAUDE.md requires: the file `--file` would otherwise name. */
  static sourceArgs = {
    file: Args.string({description: 'Policy XanoScript file (same as --file)', ignoreStdin: true, required: false}),
  }
  static sourceFlags = {
    file: Flags.string({char: 'f', description: 'Policy XanoScript file', exclusive: ['stdin']}),
    stdin: Flags.boolean({default: false, description: 'Read policy XanoScript from stdin', exclusive: ['file']}),
  }

  protected override async catch(error: Error & {oclif?: {exit?: number}}): Promise<void> {
    return this.catchAsOperational(error)
  }

  /**
   * A request against a workspace route that answers like the policy routes do: folded errors,
   * the permission guidance for the `workspace:policy` gates, and exit 1 on any failure.
   * `route` names a sibling of `/policy` (and how its failures introduce themselves).
   */
  protected policyRequest(profile: ProfileConfig, workspace: string, branch: string, verbose: boolean, rawPayload = false, route: {label?: string; path?: string} = {}): PolicyRequest {
    const {label = 'Policy', path: routePath = '/policy'} = route
    const base = `${profile.instance_origin}/api:meta/workspace/${workspace}${routePath}`
    return async (path = '', method = 'GET', body?: unknown, query: Record<string, string> = {}) => {
      const url = `${base}${path}?${new URLSearchParams({branch, ...query})}`
      const response = await this.verboseFetch(
        url,
        {
          body: body === undefined ? undefined : JSON.stringify(body),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method,
        },
        verbose,
        profile.access_token,
      )
      if (!response.ok) {
        this.error(await this.describeFailure(response, url, profile.access_token, verbose, rawPayload, label), {exit: 1})
      }

      // The native DELETE route answers with the HTTP status and, on some builds, no body
      // at all. Every other policy route sends JSON, so an empty body is only ever that.
      const text = await response.text()
      if (text.trim() === '') return {}
      try {
        return JSON.parse(text)
      } catch {
        return this.error(`${label} request to ${path || '/'} returned a ${response.status} that is not JSON.`, {exit: 1})
      }
    }
  }

  protected async runPolicy(action: string, flags: PolicyFlags, target?: string): Promise<void> {
    const {profile} = this.resolveProfile(flags)
    const workspace = flags.workspace || profile.workspace
    if (!workspace) this.error('Workspace ID required. Use --workspace or set one in your profile.')
    const branch = flags.branch ?? profile.branch ?? ''
    const context: PolicyContext = {branch, flags, request: this.policyRequest(profile, workspace, branch, flags.verbose, flags.output === 'json'), workspace}

    try {
      switch (action) {
        case 'delete': {
          await this.runDelete(context, target ?? '')
          break
        }

        case 'evaluate': {
          await this.runEvaluate(context)
          break
        }

        case 'parse':
        case 'publish': {
          await this.runSource(action, context, target)
          break
        }

        case 'runs': {
          await this.runRuns(context, target)
          break
        }

        case 'status': {
          await this.runStatus(context)
          break
        }

        default: {
          await this.runList(action, context)
        }
      }
    } catch (error) {
      if (error instanceof Error && 'oclif' in error) throw error
      this.error(`Policy ${action} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /** Simple y/N on stdin, the same prompt every other destructive command in this CLI uses. */
  private async confirmPolicyDelete(message: string): Promise<boolean> {
    const readline = await import('node:readline')
    const rl = readline.createInterface({input: process.stdin, output: process.stdout})
    return new Promise((resolve) => {
      rl.question(message, (answer) => {
        rl.close()
        resolve(['y', 'yes'].includes(answer.trim().toLowerCase()))
      })
    })
  }

  /** Policy routes fold backend errors, redact the credential and name a missing branch; other commands keep the raw server message. */
  private async describeFailure(response: Response, url: string, accessToken: string, verbose: boolean, rawPayload = false, label = 'Policy'): Promise<string> {
    const redacted = (await response.text()).replaceAll(accessToken, '[REDACTED]')
    if (verbose && redacted) this.logToStderr(redacted)
    // Summary output locates a parse error the way a person counts (line 1 is the first line);
    // `-o json` keeps the platform's payload untouched for whatever parses it.
    const detail = formatApiError(foldApiError(redacted, response.status, url), {rawPayload})
    // Scope, role and feature-off are three different 403s with three different remedies.
    const guidance = policyPermissionGuidance(response.status, detail)
    return `${label} request failed (${response.status}): ${detail}${guidance}`
  }

  /**
   * The file, however it was named. `xano policy parse policies/AUTH-001.xs` used to be swallowed
   * into the command id (`command policy:parse:policies/AUTH-001.xs not found`, exit 2, the code
   * reserved for findings), because the command declared no positional at all.
   */
  private resolveSourceFile(flags: PolicyFlags, positional?: string): string | undefined {
    const named = positional?.trim()
    if (!named) return flags.file
    if (flags.stdin) this.error('Provide policy source once: a file (positional or --file) or --stdin.')
    if (flags.file && flags.file !== named) this.error('Provide the file once: as a positional or as --file.')
    return flags.file ?? named
  }

  /**
   * Deleting is the one lifecycle step the CLI could not do: a policy created from the
   * terminal had to be removed from the MCP or Studio, because `workspace push` is
   * additive and deleting the file leaves the policy in place.
   */
  private async runDelete({branch, flags, request, workspace}: PolicyContext, target: string): Promise<void> {
    const wanted = target.trim()
    if (!wanted) this.error('Provide the policy key or ID to delete.')
    const policies = list(await request())
    // A key is what an author holds; an id is what the MCP and the API answer with.
    const matched = policies.find((policy) => policy.key === wanted)
      ?? (/^\d+$/.test(wanted) ? policies.find((policy) => policy.id === Number(wanted)) : undefined)
    if (!matched) {
      const known = policies.map((policy) => policy.key).sort()
      this.error(`No policy "${wanted}" on workspace ${workspace}${branch ? ` (${branch})` : ''}.${
        known.length > 0 ? ` This branch has: ${known.join(', ')}.` : ' This branch has no policies.'}`)
    }

    const version = typeof matched.version === 'number' ? `, Version ${matched.version}` : ''
    const where = `workspace ${workspace}${branch ? ` (${branch})` : ''}`
    if (!flags.force) {
      const confirmed = await this.confirmPolicyDelete(
        `Delete policy ${matched.key} (ID: ${matched.id}${version}) from ${where}? Its Version History goes with it. (y/N) `,
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    await request(`/${matched.id}`, 'DELETE')
    if (flags.output === 'json') this.log(JSON.stringify({deleted: true, id: matched.id, key: matched.key}, null, 2))
    else this.log(`Deleted policy ${matched.key} (ID: ${matched.id}) from ${where}.`)
  }

  private async runEvaluate({flags, request}: PolicyContext): Promise<void> {
    // The evaluation answers with the stored run, so its own snapshot names any unnamed rule.
    const result = (await request('/evaluate', 'POST', {trigger: 'manual'})) as PolicyRun & {policy_check?: PolicyCheck}
    if (flags.output === 'json') this.log(JSON.stringify(result, null, 2))
    else {
      for (const line of policySummary(result.policy_check, result.policies ?? [])) this.log(line)
      // The command that just produced the run can show what it recorded, instead of
      // sending the caller to `policy status --run-detail` for the same run.
      if (flags['run-detail']) {
        const detail = policyRunDetail(result)
        for (const line of detail) this.log(line)
        if (detail.length === 0) this.log('This run recorded no policy descriptions or rule settings.')
      }
    }

    const warning = policyCheckWarning(result.policy_check)
    if (warning) this.warn(warning)
    const code = policyExitCode(result.policy_check)
    if (code) process.exitCode = code
  }

  private async runList(action: string, {flags, request}: PolicyContext): Promise<void> {
    const result = await request(action === 'catalogue' ? '/check' : '')
    if (action === 'catalogue' && flags.check) {
      // `--check` narrows both output modes, so `-o json` stays pipeable for one check too.
      const selected = selectCatalogueCheck(list<PolicyCatalogueEntry>(result), flags.check)
      this.log(flags.output === 'json' ? JSON.stringify(selected, null, 2) : policyCatalogueSummary(selected).join('\n'))
      return
    }

    if (flags.output === 'json') this.log(JSON.stringify(result, null, 2))
    else if (action === 'catalogue') {
      for (const line of policyCatalogueSummary(list<PolicyCatalogueEntry>(result))) this.log(line)
    } else {
      const policies = list(result)
      if (policies.length === 0) this.log('No policies found.')
      for (const policy of policies)
        // The version is what tells a reader whether stored evidence is still current,
        // so it belongs beside the lifecycle rather than only in `-o json`.
        this.log(`${policy.key}  ${policy.lifecycle ?? 'draft'}  ${policy.title ?? ''} (ID: ${policy.id}${
          typeof policy.version === 'number' ? `, Version ${policy.version}` : ''})`)
    }
  }

  /**
   * The retained runs, and any one of them. `policy status` answers "where do I stand
   * now?" from the newest run only; this answers "what did the run before that check?",
   * which until now was reachable from an agent and not from a terminal.
   */
  private async runRuns({flags, request}: PolicyContext, target?: string): Promise<void> {
    const wanted = target?.trim() ?? ''
    if (wanted !== '') {
      if (!/^\d+$/.test(wanted)) this.error(`"${wanted}" is not a run ID. Run \`xano policy runs\` for the retained runs.`)
      const run = (await request(`/run/${wanted}`)) as PolicyRun
      if (flags.output === 'json') {
        this.log(JSON.stringify(run, null, 2))
        return
      }

      for (const line of policyRunSummary(run)) this.log(line)
      if (flags['run-detail']) {
        const detail = policyRunDetail(run)
        for (const line of detail) this.log(line)
        if (detail.length === 0) this.log(`Run ${run.id ?? wanted} predates recorded descriptions and settings; evaluate again to record them.`)
      }

      return
    }

    const runs = list<PolicyRun>(await request('/run', 'GET', undefined, {limit: String(flags.limit ?? 20)}))
    if (flags.output === 'json') {
      this.log(JSON.stringify(runs, null, 2))
      return
    }

    if (runs.length === 0) {
      this.log('No policy runs retained on this branch.')
      return
    }

    this.log('Run   Status  Findings      Checked     Trigger  Started')
    for (const run of runs) this.log(policyRunRow(run))
    this.log('Only the newest twenty runs are retained per branch. Read one with `xano policy runs <id> --run-detail`.')
  }

  private async runSource(action: string, {branch, flags, request, workspace}: PolicyContext, positional?: string): Promise<void> {
    const file = this.resolveSourceFile(flags, positional)
    if (!file && !flags.stdin) this.error('Provide --file or --stdin for policy source.')
    const source = fs.readFileSync(flags.stdin ? 0 : file!, 'utf8')
    const parsed = (await request('/parse', 'POST', {source})) as {policy: Policy; source: string}
    if (!parsed.policy?.key || typeof parsed.source !== 'string')
      this.error('The platform did not return a parsed policy and canonical source.')
    if (action === 'parse') {
      this.log(flags.output === 'json' ? JSON.stringify(parsed, null, 2) : parsed.source)
      return
    }

    const existing = list(await request()).find((policy) => policy.key === parsed.policy.key)
    const body: {data: {source: string}; message?: string} = {data: {source: parsed.source}}
    if (flags.message) body.message = flags.message
    const saved = await request(existing ? `/${existing.id}` : '', existing ? 'PUT' : 'POST', body)
    if (!isSavedPolicy(saved, parsed.policy.key)) {
      this.error('Publish outcome is indeterminate: the server did not return a saved policy with an id and matching key. Check policy list/status before retrying.', {exit: 1})
    }

    // `-o json` stays a faithful passthrough, `unchanged` included.
    if (flags.output === 'json') {
      this.log(JSON.stringify(saved, null, 2))
      return
    }

    // A save whose definition matches the stored one writes nothing at all: no version, no history
    // entry, no audit record. An instance that predates the flag sends neither field.
    const row = saved as {unchanged?: unknown; version?: unknown}
    const version = typeof row.version === 'number' ? ` (Version ${row.version})` : ''
    const where = `workspace ${workspace}${branch ? ` (${branch})` : ''}`
    this.log(
      row.unchanged === true
        ? `No changes to ${parsed.policy.key}${version} in ${where}.`
        : `Published ${parsed.policy.key}${version} to ${where}.`,
    )
  }

  private async runStatus({flags, request}: PolicyContext): Promise<void> {
    const policies = list(await request())
    // Runs are newest-first; status only reads the latest one.
    const run = list<PolicyRun>(await request('/run', 'GET', undefined, {limit: '1'}))[0]
    const rows = computeStatusRows(policies, run)
    if (flags.output === 'json') this.log(JSON.stringify({policies, run: run ?? null, status: rows}, null, 2))
    else if (rows.length === 0) this.log('No policies found.')
    else {
      // A stale or draft row carries no counts at all, so printing `0 findings` there would read
      // as "nothing wrong" for a policy with known findings. Say the count is not counted instead.
      const counted = (row: (typeof rows)[number]) => !row.stale && row.status !== 'draft; not evaluated'
      // Enforcement is what decides whether a finding stops a merge, and the table never said it:
      // a mandatory policy and an advisory one printed the same row. Studio's words, so they agree.
      for (const row of rows)
        this.log(`${row.key}  ${row.status}  ${enforcementLabel(row.enforcement)}  ${
          counted(row) ? `${row.findings} findings` : '— findings'}  ${row.title ?? ''}`)
      const currentKeys = new Set(rows.filter((row) => counted(row)).map((row) => row.key))
      for (const line of policyResultSummary(run?.results?.filter((result) => currentKeys.has(result.policy_key ?? '')))) this.log(line)
      if (flags['run-detail']) {
        const detail = policyRunDetail(run)
        for (const line of detail) this.log(line)
        // A retained run from before the platform recorded them has nothing to show.
        if (run && detail.length === 0) this.log(`Run ${run.id ?? '?'} predates recorded descriptions and settings; evaluate again to record them.`)
      }
    }

    if (flags['fail-on-findings']) {
      const code = statusExitCode(rows)
      if (code) {
        process.exitCode = code
        // A CI failure that names no policy is a failure the reader has to reconstruct.
        const reason = statusExitReason(rows)
        if (reason && flags.output !== 'json') this.log(reason)
      }
    }
  }
}
