import type {Policy, PolicyRuleResult, PolicyRun} from './types.js'

import {isUncheckedPass} from './findings.js'

/**
 * Where a policy stands against the latest run. `stale` means the run evaluated a different
 * version; `not_evaluated` that it has no result for every rule.
 */
export type PolicyStatus = 'draft' | 'error' | 'fail' | 'no_checks' | 'no_objects_checked' | 'not_evaluated' | 'pass' | 'stale'

export interface PolicyStatusRow {
  checked: number
  /** Whether `findings` and `checked` come from the latest run: only for an active policy it evaluated in its current version. */
  counted: boolean
  /** The policy's own enforcement (`mandatory` / `advisory`). */
  enforcement: string
  findings: number
  key: string
  /** The policy's own lifecycle (`active` / `draft`). */
  lifecycle: string
  /** Rules that passed without inspecting any object. */
  rules_unchecked: number
  /** The platform's answer: the latest run evaluated a different version of this policy. */
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

function ruleStatus(results: PolicyRuleResult[], ruleCount: number, checked: number): PolicyStatus {
  if (results.some((result) => !['fail', 'pass'].includes(result.status ?? ''))) return 'error'
  if (results.some((result) => result.status === 'fail')) return 'fail'
  if (results.length < ruleCount) return 'not_evaluated'
  return checked === 0 ? 'no_objects_checked' : 'pass'
}

/**
 * Combine the branch's policies with the latest stored run. Whether the run is still evidence for a
 * policy is the platform's `latest_run` answer; only an active policy the run evaluated in its
 * current version carries counts.
 */
export function computeStatusRows(policies: Policy[], run?: PolicyRun): PolicyStatusRow[] {
  return policies.map((policy) => {
    const ids = new Set((policy.rules ?? []).map((rule) => rule.id))
    const active = policy.lifecycle === 'active'
    const stale = policy.latest_run?.stale === true
    const counted = active && policy.latest_run?.included === true && !stale
    const results = counted
      ? (run?.results ?? []).filter((result) => result.policy_key === policy.key && ids.has(result.check_id ?? ''))
      : []
    const checked = results.reduce((sum, result) => sum + (result.checked ?? 0), 0)
    let status: PolicyStatus = 'draft'
    if (active && stale) status = 'stale'
    else if (active && ids.size === 0) status = 'no_checks'
    else if (active) status = results.length > 0 ? ruleStatus(results, ids.size, checked) : 'not_evaluated'
    return {
      checked,
      counted,
      enforcement: policy.enforcement,
      findings: counted ? (run?.findings ?? []).filter((finding) => finding.policy_key === policy.key).length : 0,
      key: policy.key,
      lifecycle: policy.lifecycle,
      rules_unchecked: status === 'pass' ? results.filter((result) => isUncheckedPass(result)).length : 0,
      stale,
      status,
      title: policy.title,
    }
  })
}

/** The rows whose evidence cannot be relied on: stale, missing or errored. A draft is never evaluated. */
function unreliableRows(rows: PolicyStatusRow[]): PolicyStatusRow[] {
  return rows.filter((row) => ['error', 'not_evaluated', 'stale'].includes(row.status))
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
