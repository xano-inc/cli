/** Reporting and file transport only. Policy grammar belongs to the platform. */
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
  results?: Array<{checked?: number; status?: string}>
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
  const lines = [`Policy check: ${check.status ?? 'unavailable'}${check.blocking ? ' (mandatory findings)' : ''}`]
  if (check.message) lines.push(check.message)
  for (const finding of check.findings ?? []) {
    lines.push(
      `  ${finding.rule_id ?? finding.policy_key ?? 'finding'}  ${finding.object?.type ?? ''} ${finding.object?.name ?? ''}: ${finding.message ?? ''}`,
    )
    if (finding.remediation) lines.push(`    Fix: ${finding.remediation}`)
  }

  const checked = (check.results ?? []).reduce((sum, result) => sum + (result.checked ?? 0), 0)
  if (check.results?.length && checked === 0) lines.push('No objects checked; this run does not demonstrate coverage.')
  return lines
}
