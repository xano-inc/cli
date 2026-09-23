import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'

import type {Policy, PolicyRun} from './utils/policy/types.js'

import BaseCommand from './base-command.js'
import {type PolicyRequest, policyRequest, policyScope} from './utils/policy/request.js'
import {policyRunDetail} from './utils/policy/runs.js'

/** The workspace and branch a policy command acts on, and requests bound to them. */
export interface PolicyTarget {
  branch: string
  request: PolicyRequest
  workspace: string
}

interface TargetFlags {
  branch?: string
  config?: string
  profile?: string
  verbose: boolean
  workspace?: string
}

/** Shared flags, request helper and output for the `policy *` commands. */
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

  /** Any failure exits 1; an error that is not the CLI's own names the command it broke. */
  protected override async catch(error: Error & {oclif?: {exit?: number}}): Promise<void> {
    if ('oclif' in error) return this.catchAsOperational(error)
    const action = this.id?.split(':').at(-1) ?? 'command'
    return this.catchAsOperational(new Error(`Policy ${action} failed: ${error.message}`))
  }

  /** Print a run's recorded detail, or say it evaluated no policy. */
  protected logRunDetail(run: PolicyRun): void {
    const detail = policyRunDetail(run)
    for (const line of detail) this.log(line)
    if (detail.length === 0) this.log(run.id ? `Run ${run.id} evaluated no policies.` : 'No policies were evaluated.')
  }

  /** Ask the parse route for the policy and its canonical source; it must return both. */
  protected async parseSource(request: PolicyRequest, source: string): Promise<{policy: Policy; source: string}> {
    const answer = (await request('/parse', 'POST', {source})) as {policy?: Policy; source?: unknown}
    if (!answer?.policy?.key || typeof answer.source !== 'string')
      this.error('The platform did not return a parsed policy and canonical source.')
    return answer as {policy: Policy; source: string}
  }

  /** The workspace and branch from the flags or the profile, and a request helper bound to them. */
  protected policyTarget(flags: TargetFlags): PolicyTarget {
    const {profile} = this.resolveProfile(flags)
    const {branch, workspace} = policyScope(flags, profile)
    if (!workspace) this.error('Workspace ID required. Use --workspace or set one in your profile.')
    const request = policyRequest(
      {error: (message) => this.error(message), logToStderr: (message) => this.logToStderr(message), verboseFetch: (...args) => this.verboseFetch(...args)},
      {branch, label: 'Policy', path: '/policy', profile, verbose: flags.verbose, workspace},
    )
    return {branch, request, workspace}
  }

  /** Policy source from the positional, `--file` or `--stdin`; a file named twice must be named the same. */
  protected readSource(flags: {file?: string; stdin?: boolean}, positional?: string): string {
    const named = positional?.trim()
    if (named && flags.stdin) this.error('Provide policy source once: a file (positional or --file) or --stdin.')
    if (named && flags.file && flags.file !== named) this.error('Provide the file once: as a positional or as --file.')
    const file = flags.file ?? named
    if (!file && !flags.stdin) this.error('Provide the policy file (as an argument or --file) or --stdin.')
    return fs.readFileSync(flags.stdin ? 0 : file!, 'utf8')
  }

  /** `workspace 3 (feature)`, or just `workspace 3` for live. */
  protected where({branch, workspace}: {branch: string; workspace: string}): string {
    return `workspace ${workspace}${branch ? ` (${branch})` : ''}`
  }
}
