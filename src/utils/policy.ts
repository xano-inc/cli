/** Reporting and file transport only. Policy grammar belongs to the platform. */
export interface PolicyCatalogueEntry {
  description?: string
  fix_hint?: string
  id: string
  /** The check's human name, as the platform publishes it; older instances send none. */
  label?: string
  object_kinds?: string[]
  params?: Record<string, {required?: boolean; type?: string}>
  title?: string
}

/**
 * The catalogue holds 28 checks and prints ~180 lines, so `--check` narrows it to one. An id that
 * is not in the catalogue names the closest matches rather than reprinting the whole list: the
 * usual mistake is a typo one character from a real id.
 */
export function selectCatalogueCheck(checks: PolicyCatalogueEntry[], id: string): PolicyCatalogueEntry[] {
  const wanted = id.trim().toLowerCase()
  const exact = checks.filter(check => check.id.toLowerCase() === wanted)
  if (exact.length > 0) return exact
  const near = checks.map(check => check.id).filter(known => {
    const lower = known.toLowerCase()
    return lower.includes(wanted) || wanted.includes(lower) || editDistanceWithin(lower, wanted, 2)
  }).sort()
  throw new Error(`"${id}" is not a policy check.${near.length > 0
    ? ` Did you mean ${near.join(', ')}?`
    : ' Run `xano policy catalogue` for the full list.'}`)
}

/** Cheap bounded Levenshtein: true when `a` and `b` are at most `max` edits apart. */
function editDistanceWithin(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  let previous = Array.from({length: b.length + 1}, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1]
        : 1 + Math.min(previous[j - 1], previous[j], current[j - 1])
    }

    if (Math.min(...current) > max) return false
    previous = current
  }

  return previous[b.length] <= max
}

export function policyCatalogueSummary(checks: PolicyCatalogueEntry[]): string[] {
  if (checks.length === 0) return ['No policy checks found.']
  const rows = [
    ['Check ID', 'Label / Description', 'Object kinds', 'Required params'],
    ...checks.map(check => [
      check.id,
      // The label names the check beside its id; the description and any fix hint follow it.
      [checkLabel(check), check.description, check.fix_hint && `Fix hint: ${check.fix_hint}`].filter(Boolean).join('\n'),
      (check.object_kinds ?? []).join(', ') || '—',
      Object.entries(check.params ?? {}).filter(([, schema]) => schema.required)
        .map(([name, schema]) => `${name}: ${schema.type ?? 'any'}`).join(', ') || 'none',
    ]),
  ]
  const widths = rows[0].map((_, column) => Math.min([36, 46, 24, 32][column], Math.max(...rows.map(row => row[column].length))))
  return rows.flatMap(row => {
    const cells = row.map((cell, column) => cell.split('\n').flatMap(paragraph => {
      const lines = ['']
      for (const word of paragraph.split(/\s+/)) {
        const last = lines.length - 1
        if (lines[last] && lines[last].length + word.length + 1 > widths[column]) lines.push(word)
        else lines[last] += `${lines[last] ? ' ' : ''}${word}`
      }

      return lines
    }))
    return Array.from({length: Math.max(...cells.map(cell => cell.length))}, (_, line) =>
      cells.map((cell, column) => (cell[line] ?? '').padEnd(widths[column])).join('  ').trimEnd())
  })
}

/** A catalogue entry's own name: `label` as the platform publishes it, `title` on older instances. */
function checkLabel(check: PolicyCatalogueEntry): string {
  return check.label?.trim() || check.title?.trim() || ''
}

/** One rule as a run snapshot records it: the settings the check ran with, plus the check's label. */
export interface PolicySnapshotRule {
  check?: string
  id?: string
  label?: string
  /** Resolved settings; absent on runs stored before the platform recorded them, and `[]` for none. */
  params?: unknown
  severity?: string
  title?: string
}

/** One policy as a run snapshot records it, including the description it carried at run time. */
export interface PolicySnapshotPolicy {
  key?: string
  rules?: PolicySnapshotRule[]
  /** The policy description as written at run time; absent on runs stored before it was recorded. */
  statement?: string
  title?: string
  /** The Version History index this run evaluated; absent on runs stored before snapshots. */
  version?: number
}

/**
 * The platform's naming rule, shared with Studio: the author's title, then the check's human
 * label, then the rule id. Pass `label` from the run snapshot, or from the catalogue entry for
 * `check` when the caller already holds the catalogue; never fetch one just to name a rule.
 */
export function policyRuleName(rule: PolicySnapshotRule): string {
  return rule.title?.trim() || rule.label?.trim() || rule.id?.trim() || ''
}

/** Collision-free regardless of what a key or rule id contains. */
const ruleKey = (policyKey = '', ruleId = '') => JSON.stringify([policyKey, ruleId])

function snapshotRules(policies: PolicySnapshotPolicy[]): Map<string, PolicySnapshotRule> {
  return new Map(policies.flatMap(policy =>
    (policy.rules ?? []).map(rule => [ruleKey(policy.key, rule.id), rule] as const)))
}

export interface PolicyRuleResult {
  check_id?: string
  checked?: number
  message?: string
  policy_key?: string
  status?: string
  warnings?: string[]
}

export interface PolicyFinding {
  /** Stable finding id, used to tell a blocking finding from an advisory one. */
  id?: string
  message?: string
  object?: {name?: string; type?: string}
  policy_key?: string
  policy_title?: string
  rule_id?: string
  rule_title?: string
  severity?: string
}

export interface PolicyCheck {
  blocking?: boolean
  /** The subset of `findings` that blocks. The platform sends both; both are shown. */
  blocking_findings?: PolicyFinding[]
  findings?: PolicyFinding[]
  message?: string
  results?: PolicyRuleResult[]
  /**
   * `pass` or `fail` for a completed evaluation; otherwise why there is none: `disabled`,
   * `not_applicable`, `forbidden`, `unavailable` or `error`.
   */
  status?: string
}

export function policyFileName(key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(key)) throw new Error(`Invalid policy key: ${key}`)
  return `${key}.xs`
}

/** A completed evaluation that says whether its findings block. */
function isSettled(check: PolicyCheck): boolean {
  return ['fail', 'pass'].includes(check.status ?? '') && typeof check.blocking === 'boolean'
}

/** 2 when an active mandatory policy failed; every other outcome, including no feedback, is 0. */
export function policyExitCode(check?: PolicyCheck): number {
  return check?.status === 'fail' && check.blocking === true ? 2 : 0
}

/**
 * The one warning line for feedback that is not a settled pass or fail: the server's own status
 * and message, or that none came back. `null` when the feedback is settled.
 */
export function policyCheckWarning(check?: PolicyCheck): null | string {
  if (!check) return 'Policy check: no policy feedback returned.'
  if (isSettled(check)) return null
  const status = typeof check.status === 'string' && check.status.trim() !== '' ? check.status.trim() : 'unknown'
  const message = typeof check.message === 'string' && check.message.trim() !== ''
    ? check.message.trim()
    : (['fail', 'pass'].includes(status) ? 'the server did not say whether its findings block.' : 'no message returned.')
  return `Policy check ${status}: ${message}`
}

/** A finding names its rule the way the platform does, falling back to what the run recorded. */
function findingName(finding: PolicyFinding, rules: Map<string, PolicySnapshotRule>): string {
  const recorded = rules.get(ruleKey(finding.policy_key, finding.rule_id)) ?? {}
  return policyRuleName({
    ...recorded,
    id: finding.rule_id ?? recorded.id,
    title: finding.rule_title || recorded.title,
  }) || 'finding'
}

/**
 * One finding line. The rule id leads it, because the check's label is shared by every
 * rule that uses that check — with two rules of one policy failing, the labels alone do
 * not tell them apart, and the id is what `--run-detail` and the JSON cite.
 */
function findingLine(finding: PolicyFinding, rules: Map<string, PolicySnapshotRule>): string {
  // A rule the author left unnamed is called by its check's label, and only then by its id.
  const rule = findingName(finding, rules)
  const id = finding.rule_id?.trim()
  const policy = finding.policy_title || finding.policy_key || 'policy'
  const severity = finding.severity?.trim() ? ` [${finding.severity.trim()}]` : ''
  return `  ${[id, id === rule ? '' : rule].filter(Boolean).join('  ')}${severity} (${policy})  ${
    finding.object?.type ?? ''} ${finding.object?.name ?? ''}: ${finding.message ?? ''}`
}

/**
 * Which findings block. The platform sends `blocking_findings[]` beside `findings[]`;
 * flattening both into one list left the reader unable to tell a merge-stopping finding
 * from an advisory one, which is the only distinction that changes what they do next.
 */
function blockingIds(check: PolicyCheck): Set<string> {
  return new Set((check.blocking_findings ?? []).map(finding => finding.id ?? '').filter(Boolean))
}

/**
 * The feedback on stdout: a headline for a settled pass or fail, then any findings, errors and
 * warnings. Unsettled feedback gets no headline; `policyCheckWarning` reports it instead.
 * `snapshot` is the run's own `policies[]`, when the same payload carries it; it names unnamed rules.
 */
export function policySummary(check?: PolicyCheck, snapshot: PolicySnapshotPolicy[] = []): string[] {
  if (!check) return []
  const lines: string[] = []
  if (isSettled(check)) {
    const outcome = check.status === 'pass'
      ? 'pass'
      : (check.blocking ? 'fail (mandatory findings)' : 'advisory findings (not blocking)')
    lines.push(`Policy check: ${outcome}`)
    if (check.message) lines.push(check.message)
  }

  const rules = snapshotRules(snapshot)
  const findings = check.findings ?? []
  const blocking = blockingIds(check)
  // Only split the list when the platform actually distinguished the two groups: with no
  // `blocking_findings[]` every finding prints once, under no heading, exactly as before.
  const separated = blocking.size > 0 && findings.some(finding => !blocking.has(finding.id ?? ''))
  if (separated) {
    const blocked = findings.filter(finding => blocking.has(finding.id ?? ''))
    const advisory = findings.filter(finding => !blocking.has(finding.id ?? ''))
    lines.push(
      `Blocking findings (${blocked.length}) — these stop the merge:`,
      ...blocked.map(finding => findingLine(finding, rules)),
      `Advisory findings (${advisory.length}) — reported, not blocking:`,
      ...advisory.map(finding => findingLine(finding, rules)),
    )
  } else {
    if (blocking.size > 0 && findings.length > 0) lines.push(`Blocking findings (${findings.length}) — these stop the merge:`)
    lines.push(...findings.map(finding => findingLine(finding, rules)))
  }

  lines.push(...policyResultSummary(check.results))
  return lines
}

/** One stored run as a row in `policy runs`. */
export function policyRunRow(run: PolicyRun): string {
  const findings = (run.findings ?? []).length
  const checked = typeof run.objects_checked === 'number' ? `${run.objects_checked} objects` : '— objects'
  return `${String(run.id ?? '?').padEnd(6)}${(run.status ?? 'unknown').padEnd(8)}${
    `${findings} findings`.padEnd(14)}${checked.padEnd(12)}${(run.trigger ?? '').padEnd(9)}${run.started_at ?? ''}`.trimEnd()
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

/**
 * Errors and warnings mean different things — "this rule could not run" against "part of your
 * scope selected nothing" — so they are grouped under their own headings rather than interleaved
 * at the same indent as the findings printed above them.
 *
 * A rule that inspected nothing is reported too. The platform sends it as `status: "pass"` with
 * `checked: 0` and has no field that says otherwise, so a rule whose scope selected no object
 * printed as a pass — proving nothing about coverage while reading as proof of it.
 */
export function policyResultSummary(results: PolicyRuleResult[] = []): string[] {
  const where = (result: PolicyRuleResult) => `${result.policy_key ?? 'policy'} ${result.check_id ?? 'rule'}`
  const errors = results.filter(result => result.status === 'error')
    .map(result => `  ${where(result)}: ${result.message ?? 'No diagnostic returned.'}`)
  // A rule can pass on the names that exist while part of its scope selects nothing.
  const warnings = results.flatMap(result => (result.warnings ?? []).map(warning => `  ${where(result)}: ${warning}`))
  const lines: string[] = []
  if (errors.length > 0) lines.push('Errors:', ...errors)
  if (warnings.length > 0) lines.push('Warnings:', ...warnings)
  const checked = results.reduce((sum, result) => sum + (result.checked ?? 0), 0)
  // Every rule checking nothing is one sentence about the whole run; naming each rule as well
  // would repeat the same fact per line, so the aggregate notice stands alone.
  if (results.length > 0 && checked === 0) {
    lines.push('No objects checked; this run does not demonstrate coverage.')
    return lines
  }

  const empty = results.filter(result => result.status === 'pass' && (result.checked ?? 0) === 0)
  if (empty.length > 0) {
    lines.push('No objects checked (proves nothing about coverage):',
      ...empty.map(result => `  ${where(result)}: no objects checked`))
  }

  return lines
}

export interface Policy {
  enforcement?: string
  id: number
  key: string
  lifecycle?: string
  rules?: Array<{id: string}>
  title?: string
  updated_at?: number | string
  /** The index of the policy's newest Version History entry; it moves only when the definition changes. */
  version?: number
}

export interface PolicyRun {
  findings?: PolicyFinding[]
  finished_at?: number | string
  id?: number
  /** How many workspace objects the run inspected; runs stored before it was recorded have none. */
  objects_checked?: number
  /** The snapshot of the policies as they were when the run went out. */
  policies?: PolicySnapshotPolicy[]
  results?: PolicyRuleResult[]
  started_at?: number | string
  status?: string
  trigger?: string
}

function settingValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => settingValue(item)).join(', ')}]`
  if (value !== null && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * The resolved settings a check ran with, as `settings: name=value, …`. Values that resolved to
 * nothing are already omitted by the platform, and an empty map arrives as `[]` from PHP.
 *
 * Sorted by name. The platform's own key order is not stable between runs — two runs of the same
 * unchanged rule came back as `patterns=…, locations=…` and `hosts=…, kinds=…` — so printing it
 * verbatim made `--run-detail` diffs show changes nobody made. The order carries no meaning the
 * reader can use; the names do.
 */
export function policySettings(params: unknown): string {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return ''
  const entries = Object.entries(params as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return entries.length === 0 ? '' : `settings: ${entries.map(([name, value]) => `${name}=${settingValue(value)}`).join(', ')}`
}

/**
 * What a stored run recorded about the policies it checked: each policy's description as written
 * then, each rule's name and settings, and how many objects that rule actually inspected. Runs
 * stored before the platform recorded these fields carry none of them and print nothing at all.
 */
export function policyRunDetail(run?: PolicyRun): string[] {
  const body: string[] = []
  // The snapshot records what a rule was configured to do; only the results say what it reached.
  const coverage = new Map((run?.results ?? []).map(result => [ruleKey(result.policy_key, result.check_id), result.checked]))
  for (const policy of run?.policies ?? []) {
    const statement = typeof policy.statement === 'string' ? policy.statement.trim() : undefined
    const rules = (policy.rules ?? []).filter(rule => rule.params !== undefined).map(rule => {
      // The name falls back to the id, which the line already carries.
      const name = policyRuleName(rule)
      const checked = coverage.get(ruleKey(policy.key, rule.id))
      const inspected = checked === undefined ? '' : (checked === 0 ? 'no objects checked' : `checked ${checked}`)
      return `    ${[rule.id, name === rule.id ? '' : name, policySettings(rule.params) || 'settings: none', inspected]
        .filter(Boolean).join('  ')}`
    })
    if (statement === undefined && rules.length === 0) continue
    body.push(`  ${policy.key ?? 'policy'}${statement ? `  ${statement}` : ''}`, ...rules)
  }

  if (body.length === 0) return []
  const provenance = [run?.trigger, run?.started_at].filter(Boolean).join(', ')
  return [`Run ${run?.id ?? '?'} as recorded${provenance ? ` (${provenance})` : ''}:`, ...body]
}

export interface PolicyStatusRow {
  checked: number
  /** The policy's own enforcement (`mandatory` / `advisory`), copied so no caller joins by index. */
  enforcement: string
  findings: number
  key: string
  /** The policy's own lifecycle (`active` / `draft`), copied for the same reason. */
  lifecycle: string
  policy_updated_at: null | number | string
  run_started_at: null | number | string
  stale: boolean
  status: string
  title?: string
}

/** Studio's words for what an enforcement does, so a terminal and a browser agree. */
export function enforcementLabel(enforcement?: string): string {
  if (enforcement === 'mandatory') return 'Blocking'
  if (enforcement === 'advisory') return 'Advisory'
  return enforcement?.trim() || '—'
}

/** Native timestamps arrive as epoch numbers or ISO strings; absent values compare as NaN (never newer). */
function timestamp(value?: number | string): number {
  return typeof value === 'number' ? value : Date.parse(value ?? '')
}

/** The Version History index this run evaluated, when the run recorded one for this policy. */
function evaluatedVersion(run: PolicyRun | undefined, key: string): number | undefined {
  const snapshot = (run?.policies ?? []).find((entry) => entry.key === key)
  return typeof snapshot?.version === 'number' ? snapshot.version : undefined
}

/**
 * A run is stale when the policy has changed since it went out, is missing for an active policy,
 * or carries results for a non-active policy.
 *
 * "Changed" is the snapshot's `version` against the policy's: the platform moves that number only
 * when the definition really changes, so a no-op save no longer invalidates the evidence and a run
 * that is merely older than the last save is not called stale. Timestamps stay as the fallback for
 * runs stored before snapshots, and for a policy the snapshot never saw.
 */
function isStale(policy: Policy, run: PolicyRun | undefined, results: PolicyRuleResult[]): boolean {
  const active = policy.lifecycle === 'active'
  if (active && !run) return true
  const evaluated = evaluatedVersion(run, policy.key)
  if (evaluated === undefined || typeof policy.version !== 'number') {
    if (timestamp(policy.updated_at) > timestamp(run?.started_at)) return true
  } else if (evaluated !== policy.version) return true

  return !active && results.some((result) => ['error', 'fail', 'pass'].includes(result.status ?? ''))
}

function ruleStatus(results: PolicyRuleResult[], ruleCount: number, checked: number): string {
  if (results.some((result) => !['fail', 'pass'].includes(result.status ?? ''))) return 'error'
  if (results.some((result) => result.status === 'fail')) return 'fail'
  if (results.length < ruleCount) return 'not evaluated'
  if (checked === 0) return 'no objects checked'
  // Some rules reaching nothing is invisible in a total that other rules made nonzero, and a
  // bare `pass` would claim coverage the run never demonstrated for those rules.
  const empty = results.filter((result) => result.status === 'pass' && (result.checked ?? 0) === 0).length
  return empty > 0 ? `pass; ${empty} rule${empty === 1 ? '' : 's'} no objects checked` : 'pass'
}

/** What the policy itself says about enforcement and lifecycle, defaulted as `policy list` prints them. */
const enforcementOf = (policy: Policy): string => policy.enforcement ?? ''
const lifecycleOf = (policy: Policy): string => policy.lifecycle ?? 'draft'

/** Combine current policies with the latest stored run; stale or draft rows carry no historical counts. */
export function computeStatusRows(policies: Policy[], run?: PolicyRun): PolicyStatusRow[] {
  return policies.map((policy) => {
    const ids = new Set((policy.rules ?? []).map((rule) => rule.id))
    const results = (run?.results ?? []).filter(
      (result) => result.policy_key === policy.key && ids.has(result.check_id ?? ''),
    )
    const active = policy.lifecycle === 'active'
    const stale = isStale(policy, run, results)
    const current = active && !stale
    const checked = current ? results.reduce((sum, result) => sum + (result.checked ?? 0), 0) : 0
    let status = active ? (ids.size > 0 ? 'not evaluated' : 'no checks') : 'draft; not evaluated'
    if (active && results.length > 0) status = ruleStatus(results, ids.size, checked)
    if (active && run && stale) status = 'outdated; evaluate again'
    return {
      checked,
      enforcement: enforcementOf(policy),
      findings: current ? (run?.findings ?? []).filter((finding) => finding.policy_key === policy.key).length : 0,
      key: policy.key,
      lifecycle: lifecycleOf(policy),
      policy_updated_at: policy.updated_at ?? null,
      run_started_at: run?.started_at ?? null,
      stale,
      status,
      title: policy.title,
    }
  })
}

/** The rows whose evidence cannot be relied on: stale, missing or errored. */
function unreliableRows(rows: PolicyStatusRow[]): PolicyStatusRow[] {
  return rows.filter((row) => row.stale || ['error', 'not evaluated'].includes(row.status))
}

/** The rows whose current findings stop a merge: active, mandatory, and failing. */
function blockingRows(rows: PolicyStatusRow[]): PolicyStatusRow[] {
  return rows.filter((row) => row.lifecycle === 'active' && row.enforcement === 'mandatory' &&
    (row.findings > 0 || row.status === 'fail'))
}

/**
 * `--fail-on-findings`: 1 for stale, missing or errored evidence, then 2 for current mandatory
 * findings. Each row carries its own enforcement and lifecycle, so nothing is joined by index.
 */
export function statusExitCode(rows: PolicyStatusRow[]): number {
  if (unreliableRows(rows).length > 0) return 1
  return blockingRows(rows).length > 0 ? 2 : 0
}

/**
 * Why `--fail-on-findings` failed, in one line, or `null` when it did not. A nonzero exit with
 * no explanation left the reader to diff the table against the exit code themselves.
 */
export function statusExitReason(rows: PolicyStatusRow[]): null | string {
  const unreliable = unreliableRows(rows)
  if (unreliable.length > 0) {
    // Each row's own status already says which of the three it is (`outdated; evaluate again`,
    // `not evaluated`, `error`), so the line names the policy and repeats it rather than guessing.
    return `Evaluation evidence is stale, missing or errored (${
      unreliable.map((row) => `${row.key} ${row.status}`).join(', ')}); exit 1.`
  }

  const blocking = blockingRows(rows)
  if (blocking.length === 0) return null
  const keys = blocking.map((row) => row.key).join(', ')
  const findings = blocking.reduce((sum, row) => sum + row.findings, 0)
  return findings > 0
    ? `Merge blocked by policy: ${findings} blocking finding${findings === 1 ? '' : 's'} on mandatory policies (${keys}).`
    : `Merge blocked by policy: mandatory policies failed (${keys}).`
}
