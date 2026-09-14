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
