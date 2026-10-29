import type {PolicyActor, PolicyOverride, PolicyRun, PolicyRunHead, PolicyRunListPage, PolicyRunScope, PolicyRunSummary} from './types.js'

import {findingLine, hasNoObjects, policyResultSummary, policyRuleName, ruleKey, snapshotRules} from './findings.js'

const RUN_COLUMNS = [7, 8, 24, 13, 12, 10, 14, 0]
const runRow = (cells: string[]) => cells.map((cell, index) => cell.padEnd(RUN_COLUMNS[index])).join('').trimEnd()

/** A gate's outcome in words (`allowed with override`); `—` for a check that gated nothing. */
export function outcomeLabel(outcome?: null | string): string {
  return typeof outcome === 'string' && outcome !== '' ? outcome.replaceAll('_', ' ') : '—'
}

/** What a run covered: `workspace`, or `partial (3 objects)` for the objects a publish carried. */
export function scopeLabel(scope?: PolicyRunScope): string {
  if (scope?.kind !== 'partial') return 'workspace'
  const count = scope.count ?? scope.objects?.length ?? 0
  return `partial (${count} object${count === 1 ? '' : 's'})`
}

function actorName(actor?: null | PolicyActor): string {
  return actor?.name?.trim() || actor?.kind?.trim() || ''
}

/** The findings column: how many, and how many are Block ones. */
function findingsCell(counts: PolicyRunSummary['counts']): string {
  const findings = counts?.findings ?? 0
  return counts?.block ? `${findings} (${counts.block} Block)` : String(findings)
}

/** One page of the stored runs, as the run list summarises them, in a table, header first. */
export function policyRunTable(runs: PolicyRunSummary[]): string[] {
  return [
    runRow(['Check', 'Status', 'Outcome', 'Findings', 'Trigger', 'Source', 'Run by', 'Date']),
    ...runs.map((run) => runRow([
      String(run.id),
      run.status,
      outcomeLabel(run.outcome),
      findingsCell(run.counts),
      run.trigger ?? '',
      run.branch?.label ?? '',
      actorName(run.actor),
      [run.finished_at ?? run.started_at ?? '', run.scope?.kind === 'partial' ? scopeLabel(run.scope) : ''].filter(Boolean).join('  '),
    ])),
  ]
}

/**
 * Where a page of the run list sits, how to read the next, and what is kept: gated checks and release
 * checks for good, manual checks and publish reports their 20 newest.
 */
export function policyRunListFooter(page: PolicyRunListPage, options: {filtered: boolean; next: string}): string[] {
  const shown = page.items?.length ?? 0
  const total = typeof page.itemsTotal === 'number' ? page.itemsTotal : undefined
  const current = page.curPage ?? 1
  const lines = [`Page ${current}: ${shown} of ${total ?? shown} run${total === 1 ? '' : 's'}${options.filtered ? ' matching' : ''}.`]
  if (typeof page.nextPage === 'number') lines.push(`Next page: \`${options.next} --page ${page.nextPage}\``)
  lines.push('Gated checks (merge, push, set live, install, publish, deploy) and release checks are kept; manual checks and publish reports keep their 20 newest. Read one with `xano policy runs <id> --run-detail`.')
  return lines
}

/** A run's gate lines: its outcome, the override (reason, who, when) and the gate's sentence. */
export function runGateLines(run: {note?: null | string; outcome?: null | string; override?: null | PolicyOverride}): string[] {
  if (!run.outcome) return []
  const lines = [`Outcome: ${outcomeLabel(run.outcome)}`]
  const {override} = run
  if (override?.reason) {
    const by = actorName(override.by)
    lines.push(`Override: "${override.reason}"${by ? ` by ${by}` : ''}${override.at ? ` at ${override.at}` : ''}`)
  }

  if (run.note?.trim()) lines.push(run.note.trim())
  return lines
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
 * `policy_check.block` is the gate's verdict at the time and is not stored. With `page`, the
 * run's findings are one page of them (`GET run/{id}/findings`) and its counts are the summary's.
 */
export function policyRunSummary(run: PolicyRunHead, page?: PolicyRunPage): string[] {
  const when = [run.started_at, run.finished_at].filter(Boolean).join(' → ')
  const checked = typeof run.objects_checked === 'number' ? `  ${run.objects_checked} objects checked` : ''
  const scope = run.scope?.kind === 'partial' ? `  ${scopeLabel(run.scope)}` : ''
  const lines = [`Run ${run.id ?? '?'}  ${run.status ?? 'unknown'}${run.trigger ? `  ${run.trigger}` : ''}${
    when ? `  ${when}` : ''}${checked}${scope}`, ...runGateLines(run)]
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
    ? [`Findings: ${counts.findings} (${counts.block} Block, ${counts.warn ?? counts.findings - counts.block} Warn)`]
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

/**
 * An exception entry as it reads in a list: `public ("why")` for a value exception, `query GET /health
 * ("why")` for an object exception (its name at the time, else its guid); `null` for anything else.
 */
function exceptionValue(value: unknown): null | string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entry = value as Record<string, unknown>
  if (typeof entry.reason !== 'string') return null
  const reason = entry.reason.trim() ? ` (${JSON.stringify(entry.reason.trim())})` : ''
  if (typeof entry.value === 'string') return `${entry.value}${reason}`
  if (typeof entry.kind === 'string' && typeof entry.guid === 'string') {
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : entry.guid
    return `${entry.kind} ${name}${reason}`
  }

  return null
}

function settingValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => exceptionValue(item) ?? settingValue(item)).join(', ')}]`
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
      const inspected = result?.checked === undefined ? '' : (hasNoObjects(result) ? 'no objects checked' : `checked ${result.checked}`)
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
