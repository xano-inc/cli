import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'

import BaseCommand, {type ProfileConfig} from './base-command.js'
import {confirm} from './utils/multidoc-push.js'
import {describePolicyError} from './utils/policy-errors.js'
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
  policyRunSummary,
  policyRunTable,
  policySummary,
  selectCatalogueCheck,
  statusExitCode,
  statusExitReason,
  statusLabel,
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

/** The `items` of a list envelope, as every policy list route answers. */
function list<T = Policy>(data: unknown): T[] {
  if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) return data.items
  throw new Error('The platform answered a list request without an items array.')
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
  protected policyRequest(profile: ProfileConfig, workspace: string, branch: string, verbose: boolean, route: {label?: string; path?: string} = {}): PolicyRequest {
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
            ...(body === undefined ? {} : {'Content-Type': 'application/json'}),
          },
          method,
        },
        verbose,
        profile.access_token,
      )
      if (!response.ok) {
        const text = (await response.text()).replaceAll(profile.access_token, '[REDACTED]')
        if (verbose && text) this.logToStderr(text)
        const detail = describePolicyError(text, response.status, url)
        this.error(`${label} request failed (${response.status}): ${detail}${policyPermissionGuidance(response.status, detail)}`)
      }

      // The DELETE route can answer with no body at all; every other route sends JSON.
      const text = await response.text()
      if (text.trim() === '') return {}
      try {
        return JSON.parse(text)
      } catch {
        return this.error(`${label} request to ${path || '/'} returned a ${response.status} that is not JSON.`)
      }
    }
  }

  protected async runPolicy(action: string, flags: PolicyFlags, target?: string): Promise<void> {
    const {profile} = this.resolveProfile(flags)
    const workspace = flags.workspace || profile.workspace
    if (!workspace) this.error('Workspace ID required. Use --workspace or set one in your profile.')
    const branch = flags.branch ?? profile.branch ?? ''
    const context: PolicyContext = {branch, flags, request: this.policyRequest(profile, workspace, branch, flags.verbose), workspace}

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

  /** The parse route's answer, which must carry the policy and its canonical source. */
  private canonical(parsed: unknown): {policy: Policy; source: string} {
    const answer = parsed as {policy?: Policy; source?: unknown}
    if (!answer?.policy?.key || typeof answer.source !== 'string')
      this.error('The platform did not return a parsed policy and canonical source.')
    return answer as {policy: Policy; source: string}
  }

  /** Print a run's recorded detail, or say it evaluated no policy. */
  private logRunDetail(run: PolicyRun): void {
    const detail = policyRunDetail(run)
    for (const line of detail) this.log(line)
    if (detail.length === 0) this.log(`Run ${run.id ?? '?'} evaluated no policies.`)
  }

  /** The file, named as a positional or as `--file`, but not both with different paths. */
  private resolveSourceFile(flags: PolicyFlags, positional?: string): string | undefined {
    const named = positional?.trim()
    if (!named) return flags.file
    if (flags.stdin) this.error('Provide policy source once: a file (positional or --file) or --stdin.')
    if (flags.file && flags.file !== named) this.error('Provide the file once: as a positional or as --file.')
    return flags.file ?? named
  }

  /** `workspace push` is additive, so deleting a policy file leaves the policy in place; this removes it. */
  private async runDelete({branch, flags, request, workspace}: PolicyContext, target: string): Promise<void> {
    const wanted = target.trim()
    if (!wanted) this.error('Provide the policy key or ID to delete.')
    const policies = list(await request())
    const matched = policies.find((policy) => policy.key === wanted)
      ?? (/^\d+$/.test(wanted) ? policies.find((policy) => policy.id === Number(wanted)) : undefined)
    if (!matched) {
      const known = policies.map((policy) => policy.key).sort()
      this.error(`No policy "${wanted}" on workspace ${workspace}${branch ? ` (${branch})` : ''}.${
        known.length > 0 ? ` This branch has: ${known.join(', ')}.` : ' This branch has no policies.'}`)
    }

    const where = `workspace ${workspace}${branch ? ` (${branch})` : ''}`
    if (!flags.force) {
      const confirmed = await confirm(
        `Delete policy ${matched.key} (ID: ${matched.id}, Version ${matched.version}) from ${where}? Its Version History is kept.`,
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
      if (flags['run-detail']) this.logRunDetail(result)
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
        this.log(`${policy.key}  ${policy.lifecycle}  ${policy.title ?? ''} (ID: ${policy.id}, Version ${policy.version})`)
    }
  }

  /** The retained runs, or one of them by id, including runs older than the one `status` reads. */
  private async runRuns({flags, request}: PolicyContext, target?: string): Promise<void> {
    const wanted = target?.trim() ?? ''
    if (wanted === '') {
      if (flags['run-detail']) this.error('--run-detail reads one run: `xano policy runs <id> --run-detail`.')
      const result = await request('/run', 'GET', undefined, {limit: String(flags.limit ?? 20)})
      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
        return
      }

      const runs = list<PolicyRun>(result)
      if (runs.length === 0) {
        this.log('No policy runs retained on this branch.')
        return
      }

      for (const line of policyRunTable(runs)) this.log(line)
      this.log('Only the most recent runs are retained per branch. Read one with `xano policy runs <id> --run-detail`.')
      return
    }

    if (!/^\d+$/.test(wanted)) this.error(`"${wanted}" is not a run ID. Run \`xano policy runs\` for the retained runs.`)
    const run = (await request(`/run/${wanted}`)) as PolicyRun
    if (flags.output === 'json') {
      this.log(JSON.stringify(run, null, 2))
      return
    }

    for (const line of policyRunSummary(run)) this.log(line)
    if (flags['run-detail']) this.logRunDetail(run)
  }

  private async runSource(action: string, {branch, flags, request, workspace}: PolicyContext, positional?: string): Promise<void> {
    const file = this.resolveSourceFile(flags, positional)
    if (!file && !flags.stdin) this.error('Provide the policy file (as an argument or --file) or --stdin.')
    const source = fs.readFileSync(flags.stdin ? 0 : file!, 'utf8')
    const parsing = request('/parse', 'POST', {source}).then((parsed) => this.canonical(parsed))
    if (action === 'parse') {
      const parsed = await parsing
      this.log(flags.output === 'json' ? JSON.stringify(parsed, null, 2) : parsed.source)
      return
    }

    // The key picks PUT or POST, so the list is read alongside the parse rather than after it.
    const [parsed, listed] = await Promise.all([parsing, request()])
    const existing = list(listed).find((policy) => policy.key === parsed.policy.key)
    const body: {data: {source: string}; message?: string} = {data: {source: parsed.source}}
    if (flags.message) body.message = flags.message
    const saved = (await request(existing ? `/${existing.id}` : '', existing ? 'PUT' : 'POST', body)) as {id?: unknown; unchanged?: unknown; version?: unknown}
    if (typeof saved?.id !== 'number') {
      this.error('The platform did not return the saved policy. Check `xano policy list` before retrying.')
    }

    if (flags.output === 'json') {
      this.log(JSON.stringify(saved, null, 2))
      return
    }

    // A save identical to the stored definition writes nothing: no version, history entry or audit record.
    const where = `workspace ${workspace}${branch ? ` (${branch})` : ''}`
    this.log(saved.unchanged === true
      ? `No changes to ${parsed.policy.key} (Version ${saved.version}) in ${where}.`
      : `Published ${parsed.policy.key} (Version ${saved.version}) to ${where}.`)
  }

  private async runStatus({flags, request}: PolicyContext): Promise<void> {
    // Runs are newest-first; status only reads the latest one.
    const [listed, runs] = await Promise.all([request(), request('/run', 'GET', undefined, {limit: '1'})])
    const policies = list(listed)
    const run = list<PolicyRun>(runs)[0]
    const rows = computeStatusRows(policies, run)
    const failOnFindings = flags['fail-on-findings'] ? {exit: statusExitCode(rows), reason: statusExitReason(rows)} : undefined
    if (flags.output === 'json') {
      this.log(JSON.stringify({policies, run: run ?? null, status: rows, ...(failOnFindings ? {fail_on_findings: failOnFindings} : {})}, null, 2))
    } else if (rows.length === 0) this.log('No policies found.')
    else {
      // A draft or stale row has no current count, and `0 findings` would read as "nothing wrong".
      for (const row of rows)
        this.log(`${row.key}  ${statusLabel(row)}  ${enforcementLabel(row)}  ${
          row.counted ? `${row.findings} findings` : '— findings'}  ${row.title ?? ''}`)
      const counted = new Set(rows.filter((row) => row.counted).map((row) => row.key))
      for (const line of policyResultSummary(run?.results?.filter((result) => counted.has(result.policy_key ?? '')))) this.log(line)
      if (flags['run-detail'] && run) this.logRunDetail(run)
      if (failOnFindings?.reason) this.log(failOnFindings.reason)
    }

    if (failOnFindings?.exit) process.exitCode = failOnFindings.exit
  }
}
