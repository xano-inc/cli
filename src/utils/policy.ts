/** Reporting only. Policy grammar belongs to the platform. */
export interface PolicyCatalogueEntry {
  description?: string
  fix_hint?: string
  id: string
  /** The check's human name. */
  label: string
  object_kinds?: string[]
  params?: Record<string, {required?: boolean; type?: string}>
  /** Params of which a rule must set at least one. */
  requires_one_of?: string[]
}

/**
 * `--check` narrows the catalogue to one check. An id that is not in it names the closest matches
 * instead of reprinting the whole list: the usual mistake is a typo one character from a real id.
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
      [check.label.trim(), check.description, check.fix_hint && `Fix hint: ${check.fix_hint}`].filter(Boolean).join('\n'),
      (check.object_kinds ?? []).join(', ') || '—',
      requiredParams(check),
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

/** The params a rule must set: each required one, and any "one of" group. */
function requiredParams(check: PolicyCatalogueEntry): string {
  const required = Object.entries(check.params ?? {}).filter(([, schema]) => schema.required)
    .map(([name, schema]) => `${name}: ${schema.type ?? 'any'}`)
  const oneOf = check.requires_one_of ?? []
  if (oneOf.length > 0) required.push(`one of: ${oneOf.join(' | ')}`)
  return required.join(', ') || 'none'
}

/** One rule as a run snapshot records it: the settings the check ran with, plus the check's label. */
export interface PolicySnapshotRule {
  check?: string
  id?: string
  label?: string
  /** The resolved settings; PHP sends an empty map as `[]`. */
  params?: unknown
  title?: string
}

/** One policy as a run snapshot records it, including the description it carried at run time. */
export interface PolicySnapshotPolicy {
  key?: string
  rules?: PolicySnapshotRule[]
  /** The policy description as written at run time. */
  statement?: string
  title?: string
  /** The Version History index this run evaluated. */
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

/**
 * What happened to the policy documents a push carried. The preview says, per policy, whether it was
 * created, updated or left unchanged. Without a preview only the number sent is known: the import
 * response reports an unchanged policy exactly as it reports a saved one.
 */
export function policyDocumentSummary(preview: null | {operations: Array<{action: string; name: string; type: string}>}, sentPolicies: number): string[] {
  const operations = (preview?.operations ?? []).filter((op) => op.type === 'policy')
  if (operations.length === 0) {
    return sentPolicies > 0
      ? [`Policy documents: ${sentPolicies} sent without a preview, so which of them changed is not known`]
      : []
  }

  const named = (action: string) => operations.filter((op) => op.action === action).map((op) => op.name).sort()
  const created = named('create')
  const updated = named('update')
  const unchanged = named('unchanged')
  const parts = [
    created.length > 0 && `${created.length} created (${created.join(', ')})`,
    updated.length > 0 && `${updated.length} updated (${updated.join(', ')})`,
    unchanged.length > 0 && `${unchanged.length} unchanged`,
  ].filter(Boolean)
  return parts.length > 0 ? [`Policy documents: ${parts.join(', ')}`] : []
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

/** The ids of the findings the platform lists in `blocking_findings[]`. */
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
  // The list splits only when some findings block and others do not.
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

const RUN_COLUMNS = [6, 8, 14, 12, 9, 0]
const runRow = (cells: string[]) => cells.map((cell, index) => cell.padEnd(RUN_COLUMNS[index])).join('').trimEnd()

/** The retained runs as a table, header first. */
export function policyRunTable(runs: PolicyRun[]): string[] {
  return [
    runRow(['Run', 'Status', 'Findings', 'Checked', 'Trigger', 'Started']),
    ...runs.map((run) => runRow([
      String(run.id ?? '?'),
      run.status ?? 'unknown',
      `${(run.findings ?? []).length} findings`,
      typeof run.objects_checked === 'number' ? `${run.objects_checked} objects` : '— objects',
      run.trigger ?? '',
      String(run.started_at ?? ''),
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

/** A rule that passed without inspecting any object, which proves nothing about coverage. */
export function isUncheckedPass(result: PolicyRuleResult): boolean {
  return result.status === 'pass' && (result.checked ?? 0) === 0
}

/**
 * Rule errors ("this rule could not run") and scope warnings ("part of your scope selected
 * nothing") under their own headings, then the rules that passed without inspecting anything.
 */
export function policyResultSummary(results: PolicyRuleResult[] = []): string[] {
  const where = (result: PolicyRuleResult) => `${result.policy_key ?? 'policy'} ${result.check_id ?? 'rule'}`
  const errors = results.filter(result => result.status === 'error')
    .map(result => `  ${where(result)}: ${result.message ?? 'No diagnostic returned.'}`)
  const warnings = results.flatMap(result => (result.warnings ?? []).map(warning => `  ${where(result)}: ${warning}`))
  const lines: string[] = []
  if (errors.length > 0) lines.push('Errors:', ...errors)
  if (warnings.length > 0) lines.push('Warnings:', ...warnings)
  const checked = results.reduce((sum, result) => sum + (result.checked ?? 0), 0)
  // When no rule checked anything, one sentence about the run says it all.
  if (results.length > 0 && checked === 0) {
    lines.push('No objects checked; this run does not demonstrate coverage.')
    return lines
  }

  const empty = results.filter(result => isUncheckedPass(result))
  if (empty.length > 0) {
    lines.push('No objects checked (proves nothing about coverage):',
      ...empty.map(result => `  ${where(result)}: no objects checked`))
  }

  return lines
}

export interface Policy {
  enforcement: string
  id: number
  key: string
  lifecycle: string
  rules?: Array<{id: string}>
  title?: string
  updated_at?: number | string
  /** The index of the policy's newest Version History entry; it moves only when the definition changes. */
  version: number
}

export interface PolicyRun {
  findings?: PolicyFinding[]
  finished_at?: number | string
  id?: number
  /** How many workspace objects the run inspected. */
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
  return [`Run ${run?.id ?? '?'} as recorded${provenance ? ` (${provenance})` : ''}:`, ...body]
}

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
 * Whether the latest run is no longer evidence for this policy. A draft is never evaluated, so it
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
