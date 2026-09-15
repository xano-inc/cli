/* eslint-disable camelcase -- Preserve native API field names in status JSON. */
/** Reporting and file transport only. Policy grammar belongs to the platform. */
export interface PolicyCatalogueEntry {
  description?: string
  id: string
  object_kinds?: string[]
  params?: Record<string, {required?: boolean; type?: string}>
  title?: string
}

export function policyCatalogueSummary(checks: PolicyCatalogueEntry[]): string[] {
  if (checks.length === 0) return ['No policy checks found.']
  const rows = [
    ['Check ID', 'Title / Description', 'Object kinds', 'Required params'],
    ...checks.map(check => [
      check.id,
      [check.title, check.description].filter(Boolean).join(': '),
      (check.object_kinds ?? []).join(', ') || '—',
      Object.entries(check.params ?? {}).filter(([, schema]) => schema.required)
        .map(([name, schema]) => `${name}: ${schema.type ?? 'any'}`).join(', ') || 'none',
    ]),
  ]
  const widths = rows[0].map((_, column) => Math.min([36, 46, 24, 32][column], Math.max(...rows.map(row => row[column].length))))
  return rows.flatMap(row => {
    const cells = row.map((cell, column) => {
      const lines = ['']
      for (const word of cell.split(/\s+/)) {
        const last = lines.length - 1
        if (lines[last] && lines[last].length + word.length + 1 > widths[column]) lines.push(word)
        else lines[last] += `${lines[last] ? ' ' : ''}${word}`
      }

      return lines
    })
    return Array.from({length: Math.max(...cells.map(cell => cell.length))}, (_, line) =>
      cells.map((cell, column) => (cell[line] ?? '').padEnd(widths[column])).join('  ').trimEnd())
  })
}

export interface PolicyRuleResult {
  check_id?: string
  checked?: number
  message?: string
  policy_key?: string
  status?: string
}

export interface PolicyCheck {
  blocking?: boolean
  findings?: Array<{
    message?: string
    object?: {name?: string; type?: string}
    policy_key?: string
    remediation?: string
    rule_id?: string
  }>
  message?: string
  results?: PolicyRuleResult[]
  status?: string
}

export function policyFileName(key: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(key)) throw new Error(`Invalid policy key: ${key}`)
  return `${key}.xs`
}

export function policyExitCode(check?: PolicyCheck, allowMissing = false): number {
  if (check?.blocking === true) return 2
  if (!check || !['fail', 'pass'].includes(check.status ?? '') || typeof check.blocking !== 'boolean')
    return allowMissing ? 0 : 1
  return 0
}

export function policySummary(check?: PolicyCheck): string[] {
  if (!check) return ['Policy check unavailable: the server did not return policy feedback.']
  const outcome = check.status === 'fail' && check.blocking === false
    ? 'advisory findings (not blocking)'
    : `${check.status ?? 'unavailable'}${check.blocking ? ' (mandatory findings)' : ''}`
  const lines = [`Policy check: ${outcome}`]
  if (check.message) lines.push(check.message)
  for (const finding of check.findings ?? []) {
    lines.push(
      `  ${finding.rule_id ?? finding.policy_key ?? 'finding'}  ${finding.object?.type ?? ''} ${finding.object?.name ?? ''}: ${finding.message ?? ''}`,
    )
    if (finding.remediation) lines.push(`    Fix: ${finding.remediation}`)
  }

  lines.push(...policyResultSummary(check.results))
  return lines
}

export function policyResultSummary(results: PolicyRuleResult[] = []): string[] {
  const lines: string[] = []
  for (const result of results) {
    if (result.status === 'error') {
      lines.push(`  ${result.policy_key ?? 'policy'} ${result.check_id ?? 'rule'}: error: ${result.message ?? 'No diagnostic returned.'}`)
    }
  }

  const checked = results.reduce((sum, result) => sum + (result.checked ?? 0), 0)
  if (results.length > 0 && checked === 0) lines.push('No objects checked; this run does not demonstrate coverage.')
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
}

export interface PolicyRun {
  findings?: Array<{policy_key?: string}>
  results?: PolicyRuleResult[]
  started_at?: number | string
}

export interface PolicyStatusRow {
  checked: number
  findings: number
  key: string
  policy_updated_at: null | number | string
  run_started_at: null | number | string
  stale: boolean
  status: string
  title?: string
}

/** Native timestamps arrive as epoch numbers or ISO strings; absent values compare as NaN (never newer). */
function timestamp(value?: number | string): number {
  return typeof value === 'number' ? value : Date.parse(value ?? '')
}

/** A run is stale when it predates the policy edit, is missing for an active policy, or carries results for a non-active policy. */
function isStale(policy: Policy, run: PolicyRun | undefined, results: PolicyRuleResult[]): boolean {
  const active = policy.lifecycle === 'active'
  if (active && !run) return true
  if (timestamp(policy.updated_at) > timestamp(run?.started_at)) return true
  return !active && results.some((result) => ['error', 'fail', 'pass'].includes(result.status ?? ''))
}

function ruleStatus(results: PolicyRuleResult[], ruleCount: number, checked: number): string {
  if (results.some((result) => !['fail', 'pass'].includes(result.status ?? ''))) return 'error'
  if (results.some((result) => result.status === 'fail')) return 'fail'
  if (results.length < ruleCount) return 'not evaluated'
  return checked === 0 ? 'no objects checked' : 'pass'
}

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
      findings: current ? (run?.findings ?? []).filter((finding) => finding.policy_key === policy.key).length : 0,
      key: policy.key,
      policy_updated_at: policy.updated_at ?? null,
      run_started_at: run?.started_at ?? null,
      stale,
      status,
      title: policy.title,
    }
  })
}

/** `--fail-on-findings`: 1 for stale, missing or errored evidence, then 2 for current mandatory findings. */
export function statusExitCode(policies: Policy[], rows: PolicyStatusRow[]): number {
  if (rows.some((row) => row.stale || ['error', 'not evaluated'].includes(row.status))) return 1
  const mandatory = rows.some((row, index) => policies[index].lifecycle === 'active' &&
    policies[index].enforcement === 'mandatory' && (row.findings > 0 || row.status === 'fail'))
  return mandatory ? 2 : 0
}
