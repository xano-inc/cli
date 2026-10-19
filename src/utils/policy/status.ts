import type {Policy, PolicyRuleResult, PolicyRunHead} from './types.js'

import {hasNoObjects} from './findings.js'

/**
 * Where a policy stands against the latest run. `stale` means the run evaluated a different
 * version; `not_evaluated` that it has no result for every rule.
 */
export type PolicyStatus = 'error' | 'fail' | 'no_checks' | 'no_objects_checked' | 'not_evaluated' | 'off' | 'pass' | 'stale'

export interface PolicyStatusRow {
  /**
   * Whether the latest run's findings on this policy block a merge: the run evaluated it, in its
   * current version, as blocking (the platform's `latest_run.enforcement`), and found something.
   */
  blocking: boolean
  checked: number
  /** Whether `findings` and `checked` come from the latest run: only for a policy that is on and that it evaluated in its current version. */
  counted: boolean
  /** The policy's own enforcement (`off` / `advisory` / `blocking`). */
  enforcement: string
  findings: number
  key: string
  /** Completed rules that inspected no objects. */
  rules_unchecked: number
  /** The platform's answer: the latest run evaluated a different version of this policy. */
  stale: boolean
  status: PolicyStatus
  title?: string
}

/** How a row's status reads in the summary table. */
export function statusLabel(row: PolicyStatusRow): string {
  switch (row.status) {
    case 'off': {
      return 'off; not evaluated'
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

/** Whether a policy is evaluated at all: every enforcement but `off`. */
export function isEvaluated(enforcement?: null | string): boolean {
  return enforcement !== 'off'
}

/** Whether a policy's findings block a gated change: enforcement `blocking`. */
export function isBlocking(enforcement?: null | string): boolean {
  return enforcement === 'blocking'
}

/**
 * The policy's own enforcement, in Studio's words (`Off`, `Advisory`, `Blocking`). Whether its findings block
 * is `findingsLabel`'s to say.
 */
export function enforcementLabel(enforcement?: null | string): string {
  if (enforcement === 'off') return 'Off'
  if (enforcement === 'blocking') return 'Blocking'
  if (enforcement === 'advisory') return 'Advisory'
  return enforcement?.trim() || '—'
}

/**
 * `3 findings`, marked blocking when they block. A row the latest run did not count says so: a policy
 * that is on is `not checked yet` (never evaluated, or changed since), an off one `not checked`.
 */
export function findingsLabel(row: PolicyStatusRow): string {
  if (!row.counted) return row.status === 'off' ? 'not checked' : 'not checked yet'
  return `${row.findings} findings${row.blocking ? ' (blocking)' : ''}`
}

/** Where a policy that is on stands, given its rule results in a run that is still evidence for it. */
function ruleStatus(results: PolicyRuleResult[], ruleCount: number, checked: number): PolicyStatus {
  if (ruleCount === 0) return 'no_checks'
  if (results.length === 0) return 'not_evaluated'
  if (results.some((result) => !['fail', 'no_objects', 'pass'].includes(result.status ?? ''))) return 'error'
  if (results.some((result) => result.status === 'fail')) return 'fail'
  if (results.length < ruleCount) return 'not_evaluated'
  return checked === 0 ? 'no_objects_checked' : 'pass'
}

/**
 * A policy's finding count in a run: its verdict in the run summary, which counts them all without
 * listing them, or, from a whole run, its findings counted.
 */
function findingCount(run: PolicyRunHead | undefined, key: string): number {
  const verdict = (run?.policies ?? []).find((policy) => policy.key === key)
  if (typeof verdict?.findings === 'number') return verdict.findings
  return (run?.findings ?? []).filter((finding) => finding.policy_key === key).length
}

/**
 * Combine the branch's policies with the latest stored run. Whether the run is still evidence for a
 * policy is the platform's `latest_run` answer; only a policy that is on and that the run evaluated in
 * its current version carries counts.
 */
export function computeStatusRows(policies: Policy[], run?: PolicyRunHead): PolicyStatusRow[] {
  return policies.map((policy) => {
    const ids = new Set((policy.rules ?? []).map((rule) => rule.id))
    const evaluated = isEvaluated(policy.enforcement)
    const stale = policy.latest_run?.stale === true
    const counted = evaluated && policy.latest_run?.included === true && !stale
    const results = counted
      ? (run?.results ?? []).filter((result) => result.policy_key === policy.key && ids.has(result.check_id ?? ''))
      : []
    const checked = results.reduce((sum, result) => sum + (result.checked ?? 0), 0)
    const findings = counted ? findingCount(run, policy.key) : 0
    let status: PolicyStatus = 'off'
    if (evaluated) status = stale ? 'stale' : ruleStatus(results, ids.size, checked)
    return {
      blocking: counted && isBlocking(policy.latest_run?.enforcement) && findings > 0,
      checked,
      counted,
      enforcement: policy.enforcement,
      findings,
      key: policy.key,
      rules_unchecked: status === 'pass' ? results.filter((result) => hasNoObjects(result)).length : 0,
      stale,
      status,
      title: policy.title,
    }
  })
}

/** The rows whose evidence cannot be relied on: stale, missing or errored. An off policy is never evaluated. */
function unreliableRows(rows: PolicyStatusRow[]): PolicyStatusRow[] {
  return rows.filter((row) => ['error', 'not_evaluated', 'stale'].includes(row.status))
}

/**
 * `--fail-on-findings`: 2 for a current blocking finding, whatever else is true, as push and evaluate
 * exit; otherwise 1 for stale, missing or errored evidence.
 */
export function statusExitCode(rows: PolicyStatusRow[]): number {
  if (rows.some((row) => row.blocking)) return 2
  return unreliableRows(rows).length > 0 ? 1 : 0
}

/** Why `--fail-on-findings` failed, in one line naming the policies, or `null` when it did not. */
export function statusExitReason(rows: PolicyStatusRow[]): null | string {
  const unreliable = unreliableRows(rows)
  const evidence = unreliable.map((row) => `${row.key} ${statusLabel(row)}`).join(', ')
  const blocking = rows.filter((row) => row.blocking)
  if (blocking.length === 0) {
    return unreliable.length > 0 ? `Evaluation evidence is stale, missing or errored (${evidence}); exit 1.` : null
  }

  const findings = blocking.reduce((sum, row) => sum + row.findings, 0)
  // A prediction, not a verdict: the merge gate evaluates the branch again.
  return `The latest run has ${findings} blocking finding${findings === 1 ? '' : 's'} (${
    blocking.map((row) => row.key).join(', ')}); the merge gate evaluates the branch again before a merge.${
    unreliable.length > 0 ? ` Evidence is also stale, missing or errored (${evidence}).` : ''}`
}
