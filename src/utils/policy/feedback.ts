import type {PolicyCheck, PolicySnapshotPolicy} from './types.js'

import {findingLine, policyResultSummary, snapshotRules} from './findings.js'

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
