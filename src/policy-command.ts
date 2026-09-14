import {Flags} from '@oclif/core'
import * as fs from 'node:fs'

import BaseCommand from './base-command.js'
import {type PolicyCheck, policyExitCode, policySummary} from './utils/policy.js'

interface PolicyFlags {
  branch?: string
  config?: string
  file?: string
  output?: string
  profile?: string
  stdin?: boolean
  verbose: boolean
  workspace?: string
}
interface Policy {
  id: number
  key: string
  lifecycle?: string
  rules?: Array<{id: string}>
  title?: string
  updated_at?: number | string
}
interface Run {
  findings?: Array<{policy_key?: string}>
  results?: Array<{check_id?: string; checked?: number; policy_key?: string; status?: string}>
  started_at?: number | string
}

function list<T = Policy>(data: unknown): T[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) return data.items
  throw new Error('Unexpected policy list response.')
}

function timestamp(value?: number | string): number {
  return typeof value === 'number' ? value : Date.parse(value ?? '')
}

export default abstract class PolicyCommand extends BaseCommand {
  static policyFlags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({char: 'b', description: 'Branch label (defaults to profile branch or live)'}),
    output: Flags.string({char: 'o', default: 'summary', description: 'Output format', options: ['summary', 'json']}),
    workspace: Flags.string({char: 'w', description: 'Workspace ID (defaults to profile workspace)'}),
  }
  static sourceFlags = {
    file: Flags.string({char: 'f', description: 'Policy XanoScript file', exclusive: ['stdin']}),
    stdin: Flags.boolean({default: false, description: 'Read policy XanoScript from stdin', exclusive: ['file']}),
  }

  protected async runPolicy(action: string, flags: PolicyFlags): Promise<void> {
    const {profile} = this.resolveProfile(flags)
    const workspace = flags.workspace || profile.workspace
    if (!workspace) this.error('Workspace ID required. Use --workspace or set one in your profile.')
    const branch = flags.branch || profile.branch || ''
    const base = `${profile.instance_origin}/api:meta/workspace/${workspace}/policy`
    const request = async (path = '', method = 'GET', body?: unknown): Promise<unknown> => {
      const url = `${base}${path}?${new URLSearchParams({branch})}`
      const response = await this.verboseFetch(
        url,
        {
          body: body === undefined ? undefined : JSON.stringify(body),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
            'User-Agent': `xano-cli/${this.config.version}`,
          },
          method,
        },
        flags.verbose,
        profile.access_token,
      )
      if (!response.ok) this.error(`Policy request failed (${response.status}): ${(await response.text()).replaceAll(profile.access_token, '[REDACTED]')}`)
      return response.json()
    }

    try {
      if (action === 'parse' || action === 'publish') {
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
        this.log(
          flags.output === 'json'
            ? JSON.stringify(saved, null, 2)
            : `Published ${parsed.policy.key} to workspace ${workspace}${branch ? ` (${branch})` : ''}.`,
        )
        return
      }

      if (action === 'evaluate') {
        const result = (await request('/evaluate', 'POST', {trigger: 'manual'})) as {policy_check?: PolicyCheck}
        if (flags.output === 'json') this.log(JSON.stringify(result, null, 2))
        else for (const line of policySummary(result.policy_check)) this.log(line)
        const code = policyExitCode(result.policy_check)
        if (code) process.exitCode = code
        return
      }

      if (action === 'status') {
        const policies = list(await request())
        const runs = list<Run>(await request('/run'))
        const run = runs[0]
        const rows = policies.map((policy) => {
          const ids = new Set((policy.rules ?? []).map((rule) => rule.id))
          const results = (run?.results ?? []).filter(
            (result) => result.policy_key === policy.key && ids.has(result.check_id ?? ''),
          )
          const checked = results.reduce((sum, result) => sum + (result.checked ?? 0), 0)
          let status = policy.lifecycle === 'active' ? (ids.size > 0 ? 'not evaluated' : 'no checks') : 'draft'
          if (policy.lifecycle === 'active' && results.length > 0)
            status = results.some((result) => result.status === 'fail')
              ? 'fail'
              : results.some((result) => !['fail', 'pass'].includes(result.status ?? ''))
                ? 'error'
                : results.length < ids.size
                  ? 'not evaluated'
                  : checked === 0
                    ? 'no objects checked'
                    : 'pass'
          if (policy.lifecycle === 'active' && timestamp(policy.updated_at) > timestamp(run?.started_at))
            status = 'outdated; evaluate again'
          return {
            checked,
            findings: (run?.findings ?? []).filter((finding) => finding.policy_key === policy.key).length,
            key: policy.key,
            status,
            title: policy.title,
          }
        })
        if (flags.output === 'json') this.log(JSON.stringify({policies, run: run ?? null, status: rows}, null, 2))
        else if (rows.length === 0) this.log('No policies found.')
        else for (const row of rows) this.log(`${row.key}  ${row.status}  ${row.findings} findings  ${row.title ?? ''}`)
        return
      }

      const result = await request(action === 'catalogue' ? '/check' : '')
      if (flags.output === 'json' || action === 'catalogue') this.log(JSON.stringify(result, null, 2))
      else {
        const policies = list(result)
        if (policies.length === 0) this.log('No policies found.')
        for (const policy of policies)
          this.log(`${policy.key}  ${policy.lifecycle ?? 'draft'}  ${policy.title ?? ''} (ID: ${policy.id})`)
      }
    } catch (error) {
      if (error instanceof Error && 'oclif' in error) throw error
      this.error(`Policy ${action} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
