import type {PolicyRun, PolicyRunHead, PolicyRunSummary} from './types.js'

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

/** Where a page of a run's findings sits among the findings that match its filters. */
export interface PolicyRunPage {
  /** Whether a filter narrowed the findings. */
  filtered: boolean
  /** The command that reads this run's next page; `xano policy runs <id>` unless another is named. */
  next?: string
  offset: number
  /** The findings that match, listed or not. */
  total: number
}

/**
 * One stored run. A run records its findings, results and the enforcement each policy had;
 * `policy_check.blocking` is the gate's verdict at the time and is not stored. With `page`, the
 * run's findings are one page of them (`GET run/{id}/findings`) and its counts are the summary's.
 */
export function policyRunSummary(run: PolicyRunHead, page?: PolicyRunPage): string[] {
  const when = [run.started_at, run.finished_at].filter(Boolean).join(' → ')
  const checked = typeof run.objects_checked === 'number' ? `  ${run.objects_checked} objects checked` : ''
  const lines = [`Run ${run.id ?? '?'}  ${run.status ?? 'unknown'}${run.trigger ? `  ${run.trigger}` : ''}${
    when ? `  ${when}` : ''}${checked}`]
  const rules = snapshotRules(run.policies ?? [])
  const findings = run.findings ?? []
  if (page) lines.push(...pageLines(run, page))
  else if (findings.length > 0) lines.push(`Findings (${findings.length}):`, ...findings.map(finding => findingLine(finding, rules)))
  else lines.push('No findings.')
  lines.push(...policyResultSummary(run.results))
  return lines
}

/** The run's counts, then one page of its findings and how to read the next. */
function pageLines(run: PolicyRunHead, page: PolicyRunPage): string[] {
  const rules = snapshotRules(run.policies ?? [])
  const findings = run.findings ?? []
  const {counts} = run
  const lines = counts && counts.findings > 0
    ? [`Findings: ${counts.findings} (${counts.blocking} blocking, ${counts.advisory ?? counts.findings - counts.blocking} advisory)`]
    : []
  if (findings.length === 0) {
    lines.push(page.total > 0 ? `No findings from offset ${page.offset}: ${page.total} ${page.filtered ? 'match' : 'in all'}.`
      : (page.filtered ? 'No findings match.' : 'No findings.'))
    return lines
  }

  const next = page.offset + findings.length
  // A page that is not every finding says so, and how to read the rest.
  const partial = page.offset > 0 || next < page.total
  lines.push(
    `Findings ${page.offset + 1}-${next} of ${page.total}${page.filtered ? ' matching' : ''}${partial ? ' (one page)' : ''}:`,
    ...findings.map(finding => findingLine(finding, rules)),
  )
  if (next < page.total) {
    lines.push(`Next page: \`${page.next ?? `xano policy runs ${run.id}`} --offset ${next}\`, or --all for all ${page.total}${
      page.filtered ? ', with the same filters' : ''}.`)
  }

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
