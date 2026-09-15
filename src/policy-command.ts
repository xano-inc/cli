import {Flags} from '@oclif/core'
import * as fs from 'node:fs'

import BaseCommand, {type ProfileConfig} from './base-command.js'
import {foldApiError, formatApiError} from './utils/api_error.js'
import {
  computeStatusRows,
  type Policy,
  type PolicyCatalogueEntry,
  policyCatalogueSummary,
  type PolicyCheck,
  policyExitCode,
  policyResultSummary,
  type PolicyRun,
  policySummary,
  statusExitCode,
} from './utils/policy.js'

interface PolicyFlags {
  branch?: string
  config?: string
  'fail-on-findings'?: boolean
  file?: string
  output?: string
  profile?: string
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
  static sourceFlags = {
    file: Flags.string({char: 'f', description: 'Policy XanoScript file', exclusive: ['stdin']}),
    stdin: Flags.boolean({default: false, description: 'Read policy XanoScript from stdin', exclusive: ['file']}),
  }

  protected override async catch(error: Error & {oclif?: {exit?: number}}): Promise<void> {
    // Only completed evaluations set exit 2. Include profile/init and flag errors
    // in the operational exit contract, preserving intentional successful exits.
    if (error.oclif?.exit === 0) return super.catch(error)
    this.error(error, {exit: 1})
  }

  protected async runPolicy(action: string, flags: PolicyFlags): Promise<void> {
    const {profile} = this.resolveProfile(flags)
    const workspace = flags.workspace || profile.workspace
    if (!workspace) this.error('Workspace ID required. Use --workspace or set one in your profile.')
    const branch = flags.branch ?? profile.branch ?? ''
    const context: PolicyContext = {branch, flags, request: this.policyRequest(profile, workspace, branch, flags.verbose), workspace}

    try {
      switch (action) {
        case 'evaluate': {
          await this.runEvaluate(context)
          break
        }

        case 'parse':
        case 'publish': {
          await this.runSource(action, context)
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

  /** Policy routes fold backend errors, redact the credential and name a missing branch; other commands keep the raw server message. */
  private async describeFailure(response: Response, url: string, accessToken: string, verbose: boolean): Promise<string> {
    const redacted = (await response.text()).replaceAll(accessToken, '[REDACTED]')
    if (verbose && redacted) this.logToStderr(redacted)
    const detail = formatApiError(foldApiError(redacted, response.status, url))
    const guidance = response.status === 403
      ? '\nPolicy access requires the workspace:policy scope. Reissue the Metadata API token with that scope: Instance settings → Metadata API & MCP Server → Manage Access Tokens.'
      : ''
    return `Policy request failed (${response.status}): ${detail}${guidance}`
  }

  private policyRequest(profile: ProfileConfig, workspace: string, branch: string, verbose: boolean): PolicyRequest {
    const base = `${profile.instance_origin}/api:meta/workspace/${workspace}/policy`
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
        this.error(await this.describeFailure(response, url, profile.access_token, verbose), {exit: 1})
      }

      return response.json()
    }
  }

  private async runEvaluate({flags, request}: PolicyContext): Promise<void> {
    const result = (await request('/evaluate', 'POST', {trigger: 'manual'})) as {policy_check?: PolicyCheck}
    if (flags.output === 'json') this.log(JSON.stringify(result, null, 2))
    else for (const line of policySummary(result.policy_check)) this.log(line)
    const code = policyExitCode(result.policy_check)
    if (code) process.exitCode = code
  }

  private async runList(action: string, {flags, request}: PolicyContext): Promise<void> {
    const result = await request(action === 'catalogue' ? '/check' : '')
    if (flags.output === 'json') this.log(JSON.stringify(result, null, 2))
    else if (action === 'catalogue') {
      for (const line of policyCatalogueSummary(list<PolicyCatalogueEntry>(result))) this.log(line)
    } else {
      const policies = list(result)
      if (policies.length === 0) this.log('No policies found.')
      for (const policy of policies)
        this.log(`${policy.key}  ${policy.lifecycle ?? 'draft'}  ${policy.title ?? ''} (ID: ${policy.id})`)
    }
  }

  private async runSource(action: string, {branch, flags, request, workspace}: PolicyContext): Promise<void> {
    if (!flags.file && !flags.stdin) this.error('Provide --file or --stdin for policy source.')
    const source = fs.readFileSync(flags.stdin ? 0 : flags.file!, 'utf8')
    const parsed = (await request('/parse', 'POST', {source})) as {policy: Policy; source: string}
    if (!parsed.policy?.key || typeof parsed.source !== 'string')
      this.error('The platform did not return a parsed policy and canonical source.')
    if (action === 'parse') {
      this.log(flags.output === 'json' ? JSON.stringify(parsed, null, 2) : parsed.source)
      return
    }

    const existing = list(await request()).find((policy) => policy.key === parsed.policy.key)
    const saved = await request(existing ? `/${existing.id}` : '', existing ? 'PUT' : 'POST', {
      data: {source: parsed.source},
    })
    if (!isSavedPolicy(saved, parsed.policy.key)) {
      this.error('Publish outcome is indeterminate: the server did not return a saved policy with an id and matching key. Check policy list/status before retrying.', {exit: 1})
    }

    this.log(
      flags.output === 'json'
        ? JSON.stringify(saved, null, 2)
        : `Published ${parsed.policy.key} to workspace ${workspace}${branch ? ` (${branch})` : ''}.`,
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
      for (const row of rows) this.log(`${row.key}  ${row.status}  ${row.findings} findings  ${row.title ?? ''}`)
      const currentKeys = new Set(rows.filter((row) => !row.stale && row.status !== 'draft; not evaluated').map((row) => row.key))
      for (const line of policyResultSummary(run?.results?.filter((result) => currentKeys.has(result.policy_key ?? '')))) this.log(line)
    }

    if (flags['fail-on-findings']) {
      const code = statusExitCode(policies, rows)
      if (code) process.exitCode = code
    }
  }
}
