import type {PolicyCheck, PolicySnapshotPolicy} from './types.js'

import {findingLine, policyResultSummary, snapshotRules} from './findings.js'

/**
 * Feedback printed as a headline: a pass or fail that says whether its findings block, or a branch
 * with no active policy to evaluate. Everything else is reported by `policyCheckWarning`.
 */
function isHeadlined(check: PolicyCheck): boolean {
  if (check.status === 'not_applicable') return true
  return ['fail', 'pass'].includes(check.status ?? '') && typeof check.blocking === 'boolean'
}

/** 2 whenever the platform says a finding blocks, whatever the status; every other outcome is 0. */
export function policyExitCode(check?: PolicyCheck): number {
  return check?.blocking === true ? 2 : 0
}

/**
 * The one warning line for feedback without a headline (`disabled`, `forbidden`, `unavailable`,
 * `error`, an unknown status, or a pass or fail that does not say whether it blocks): the server's
 * own status and message, or that none came back. `null` for headlined feedback.
 */
export function policyCheckWarning(check?: PolicyCheck): null | string {
  if (!check) return 'Policy check: no policy feedback returned.'
  if (isHeadlined(check)) return null
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

/** The ids of the findings the platform lists in `blocking_findings[]`. */
function blockingIds(check: PolicyCheck): Set<string> {
  return new Set((check.blocking_findings ?? []).map(finding => finding.id ?? '').filter(Boolean))
}

/**
 * The feedback on stdout: a headline with the server's message, then any findings, errors and
 * warnings. Feedback without a headline is reported by `policyCheckWarning` instead.
 * `snapshot` is the run's own `policies[]`, when the same payload carries it; it names unnamed rules.
 */
export function policySummary(check?: PolicyCheck, snapshot: PolicySnapshotPolicy[] = []): string[] {
  if (!check) return []
  const lines: string[] = []
  if (isHeadlined(check)) {
    const outcome = check.status === 'fail'
      ? (check.blocking ? 'fail (blocking findings)' : 'advisory findings (not blocking)')
      : check.status
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
