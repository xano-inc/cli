import type {PolicyRun, PolicyRunSummary} from './types.js'

import {findingLine, isUncheckedPass, policyResultSummary, policyRuleName, ruleKey, snapshotRules} from './findings.js'

const RUN_COLUMNS = [6, 8, 14, 12, 9, 0]
const runRow = (cells: string[]) => cells.map((cell, index) => cell.padEnd(RUN_COLUMNS[index])).join('').trimEnd()

/** The retained runs, as the run list summarises them, in a table, header first. */
export function policyRunTable(runs: PolicyRunSummary[]): string[] {
  return [
    runRow(['Run', 'Status', 'Findings', 'Checked', 'Trigger', 'Started']),
    ...runs.map((run) => runRow([
      String(run.id),
      run.status,
      `${run.counts.findings} findings`,
      `${run.objects_checked} objects`,
      run.trigger ?? '',
      run.started_at ?? '',
    ])),
  ]
}

/**
 * One stored run in full. A run row is not a `policy_check`: it records `status`,
 * `findings` and `results` but never `blocking`, because whether a finding blocks is a
 * property of the policy's enforcement at gate time, not of the stored evidence.
 */
export function policyRunSummary(run: PolicyRun): string[] {
  const when = [run.started_at, run.finished_at].filter(Boolean).join(' → ')
  const checked = typeof run.objects_checked === 'number' ? `  ${run.objects_checked} objects checked` : ''
  const lines = [`Run ${run.id ?? '?'}  ${run.status ?? 'unknown'}${run.trigger ? `  ${run.trigger}` : ''}${
    when ? `  ${when}` : ''}${checked}`]
  const rules = snapshotRules(run.policies ?? [])
  const findings = run.findings ?? []
  if (findings.length > 0) {
    lines.push(`Findings (${findings.length}):`, ...findings.map(finding => findingLine(finding, rules)))
  } else {
    lines.push('No findings.')
  }

  lines.push(...policyResultSummary(run.results))
  return lines
}

function settingValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => settingValue(item)).join(', ')}]`
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * The resolved settings a check ran with, as `settings: name=value, …`, sorted by name so output
 * is stable. Values that resolved to nothing are already omitted by the platform.
 */
export function policySettings(params: unknown): string {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return ''
  const entries = Object.entries(params as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return entries.length === 0 ? '' : `settings: ${entries.map(([name, value]) => `${name}=${settingValue(value)}`).join(', ')}`
}

/**
 * What a stored run recorded about the policies it evaluated: each policy's description as written
 * then, and each rule's name, settings and how many objects it inspected. Empty for a run that
 * evaluated no policy.
 */
export function policyRunDetail(run?: PolicyRun): string[] {
  const results = new Map((run?.results ?? []).map(result => [ruleKey(result.policy_key, result.check_id), result]))
  const body = (run?.policies ?? []).flatMap(policy => {
    const statement = policy.statement?.trim()
    const rules = (policy.rules ?? []).map(rule => {
      // The name falls back to the id, which the line already carries.
      const name = policyRuleName(rule)
      const result = results.get(ruleKey(policy.key, rule.id))
      const inspected = result?.checked === undefined ? '' : (isUncheckedPass(result) ? 'no objects checked' : `checked ${result.checked}`)
      return `    ${[rule.id, name === rule.id ? '' : name, policySettings(rule.params) || 'settings: none', inspected]
        .filter(Boolean).join('  ')}`
    })
    return [`  ${policy.key ?? 'policy'}${statement ? `  ${statement}` : ''}`, ...rules]
  })
  if (body.length === 0) return []
  const provenance = [run?.trigger, run?.started_at].filter(Boolean).join(', ')
  const heading = run?.id ? `Run ${run.id} as recorded` : 'This evaluation, which was not stored'
  return [`${heading}${provenance ? ` (${provenance})` : ''}:`, ...body]
}
