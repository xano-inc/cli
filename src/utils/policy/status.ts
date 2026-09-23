import type {Policy, PolicyRuleResult, PolicyRun} from './types.js'

import {isUncheckedPass} from './findings.js'

/**
 * Where a policy stands against the latest run. `stale` means the run evaluated a different
 * version; `not_evaluated` that it has no result for every rule.
 */
export type PolicyStatus = 'draft' | 'error' | 'fail' | 'no_checks' | 'no_objects_checked' | 'not_evaluated' | 'pass' | 'stale'

export interface PolicyStatusRow {
  checked: number
  /** Whether `findings` and `checked` come from current evidence; draft and stale rows carry none. */
  counted: boolean
  /** The policy's own enforcement (`mandatory` / `advisory`). */
  enforcement: string
  findings: number
  key: string
  /** The policy's own lifecycle (`active` / `draft`). */
  lifecycle: string
  policy_updated_at: null | number | string
  /** Rules that passed without inspecting any object. */
  rules_unchecked: number
  run_started_at: null | number | string
  stale: boolean
  status: PolicyStatus
  title?: string
}

/** How a row's status reads in the summary table. */
export function statusLabel(row: PolicyStatusRow): string {
  switch (row.status) {
    case 'draft': {
      return 'draft; not evaluated'
    }

    case 'pass': {
      return row.rules_unchecked > 0
        ? `pass; ${row.rules_unchecked} rule${row.rules_unchecked === 1 ? '' : 's'} no objects checked`
        : 'pass'
    }

    case 'stale': {
      return 'outdated; evaluate again'
    }

    default: {
      return row.status.replaceAll('_', ' ')
    }
  }
}

/** `Blocking` only where findings stop a merge: an active, mandatory policy. A draft never blocks. */
export function enforcementLabel(row: Pick<PolicyStatusRow, 'enforcement' | 'lifecycle'>): string {
  if (row.enforcement === 'mandatory') return row.lifecycle === 'active' ? 'Blocking' : 'Mandatory'
  if (row.enforcement === 'advisory') return 'Advisory'
  return row.enforcement.trim() || '—'
}

/** Native timestamps arrive as epoch numbers or ISO strings; absent values compare as NaN (never newer). */
function timestamp(value?: number | string): number {
  return typeof value === 'number' ? value : Date.parse(value ?? '')
}

/** The Version History index this run evaluated, when the run's snapshot includes this policy. */
function evaluatedVersion(run: PolicyRun, key: string): number | undefined {
  const snapshot = (run.policies ?? []).find((entry) => entry.key === key)
  return typeof snapshot?.version === 'number' ? snapshot.version : undefined
}

/**
 * Whether the latest run has stopped being evidence for this policy. A draft is never evaluated, so it
 * is stale only when the run still carries results for it. An active policy is stale without a
 * run, or when the run evaluated another version; a policy the run's snapshot does not include is
 * judged by whether it was saved after the run started.
 */
function isStale(policy: Policy, run: PolicyRun | undefined, results: PolicyRuleResult[]): boolean {
  if (policy.lifecycle !== 'active') return results.some((result) => ['error', 'fail', 'pass'].includes(result.status ?? ''))
  if (!run) return true
  const evaluated = evaluatedVersion(run, policy.key)
  return evaluated === undefined
    ? timestamp(policy.updated_at) > timestamp(run.started_at)
    : evaluated !== policy.version
}

function ruleStatus(results: PolicyRuleResult[], ruleCount: number, checked: number): PolicyStatus {
  if (results.some((result) => !['fail', 'pass'].includes(result.status ?? ''))) return 'error'
  if (results.some((result) => result.status === 'fail')) return 'fail'
  if (results.length < ruleCount) return 'not_evaluated'
  return checked === 0 ? 'no_objects_checked' : 'pass'
}

/** Combine current policies with the latest stored run; stale and draft rows carry no counts. */
export function computeStatusRows(policies: Policy[], run?: PolicyRun): PolicyStatusRow[] {
  return policies.map((policy) => {
    const ids = new Set((policy.rules ?? []).map((rule) => rule.id))
    const results = (run?.results ?? []).filter(
      (result) => result.policy_key === policy.key && ids.has(result.check_id ?? ''),
    )
    const active = policy.lifecycle === 'active'
    const stale = isStale(policy, run, results)
    const counted = active && !stale
    const checked = counted ? results.reduce((sum, result) => sum + (result.checked ?? 0), 0) : 0
    let status: PolicyStatus = active ? (ids.size > 0 ? 'not_evaluated' : 'no_checks') : 'draft'
    if (active && results.length > 0) status = ruleStatus(results, ids.size, checked)
    if (active && run && stale) status = 'stale'
    return {
      checked,
      counted,
      enforcement: policy.enforcement,
      findings: counted ? (run?.findings ?? []).filter((finding) => finding.policy_key === policy.key).length : 0,
      key: policy.key,
      lifecycle: policy.lifecycle,
      policy_updated_at: policy.updated_at ?? null,
      rules_unchecked: status === 'pass' ? results.filter((result) => isUncheckedPass(result)).length : 0,
      run_started_at: run?.started_at ?? null,
      stale,
      status,
      title: policy.title,
    }
  })
}

/** The rows whose evidence cannot be relied on: stale, missing or errored. */
function unreliableRows(rows: PolicyStatusRow[]): PolicyStatusRow[] {
  return rows.filter((row) => row.stale || ['error', 'not_evaluated'].includes(row.status))
}

/** The rows whose current findings stop a merge: active, mandatory, and failing. */
function blockingRows(rows: PolicyStatusRow[]): PolicyStatusRow[] {
  return rows.filter((row) => row.lifecycle === 'active' && row.enforcement === 'mandatory' &&
    (row.findings > 0 || row.status === 'fail'))
}

/** `--fail-on-findings`: 1 for stale, missing or errored evidence, then 2 for current mandatory findings. */
export function statusExitCode(rows: PolicyStatusRow[]): number {
  if (unreliableRows(rows).length > 0) return 1
  return blockingRows(rows).length > 0 ? 2 : 0
}

/** Why `--fail-on-findings` failed, in one line naming the policies, or `null` when it did not. */
export function statusExitReason(rows: PolicyStatusRow[]): null | string {
  const unreliable = unreliableRows(rows)
  if (unreliable.length > 0) {
    return `Evaluation evidence is stale, missing or errored (${
      unreliable.map((row) => `${row.key} ${statusLabel(row)}`).join(', ')}); exit 1.`
  }

  const blocking = blockingRows(rows)
  if (blocking.length === 0) return null
  const keys = blocking.map((row) => row.key).join(', ')
  const findings = blocking.reduce((sum, row) => sum + row.findings, 0)
  return findings > 0
    ? `Merge blocked by policy: ${findings} blocking finding${findings === 1 ? '' : 's'} on mandatory policies (${keys}).`
    : `Merge blocked by policy: mandatory policies failed (${keys}).`
}
