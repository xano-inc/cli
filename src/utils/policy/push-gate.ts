import type {PolicyFinding} from './types.js'

import {findingLine} from './findings.js'

/**
 * One blocking finding of a refused push: its rule, policy, object and message (a finding's message
 * rarely names its object), and whether the push introduced it or changed its object.
 */
function refusedFindingLine(finding: PolicyFinding & {gate_reason?: unknown}): string {
  const reason = typeof finding.gate_reason === 'string' && finding.gate_reason.trim() ? ` (${finding.gate_reason.trim()})` : ''
  return `${findingLine(finding, new Map())}${reason}`
}

/**
 * The refusal's headline. The platform's sentence names the policies the blocking findings come from,
 * to every caller (`Push refused: 2 blocking policy findings from AUTH-010 and PII-001 (1 introduced
 * by this change, 1 on objects it changes).`), so it is printed as it is; without one, the counts.
 */
function headline(payload: Record<string, unknown>, message?: string): string {
  const sentence = message?.trim() ?? ''
  if (sentence.startsWith('Push refused:')) return sentence
  const count = (key: string) => typeof payload[key] === 'number' ? payload[key] : 0
  const total = count('total')
  return `Push refused: ${total} blocking policy finding${total === 1 ? '' : 's'} (${count('introduced')} introduced, ${count('changed')} on changed objects).`
}

/** Preserve a gate refusal through shared push and operational-error wrappers. */
export class PushPolicyGateError extends Error {
  constructor(readonly payload: Record<string, unknown>, message?: string) {
    const findings: unknown[] = Array.isArray(payload.findings) ? payload.findings.slice(0, 100) : []
    const lines = findings.flatMap(finding => finding && typeof finding === 'object' ? [refusedFindingLine(finding as PolicyFinding)] : [])
    // The findings come only to a caller who reads the workspace's policies; anyone else gets the counts.
    const withheld = payload.findings === undefined && typeof payload.total === 'number' && payload.total > 0
    const guidance = payload.can_override === true && payload.override_denied !== true
      ? 'To proceed with an audited reason, retry with --policy-override "reason".'
      : 'Fix the findings or ask someone with workspace:policy update permission to override with a reason.'
    super([
      `${headline(payload, message)} Nothing was imported.`,
      ...lines,
      ...(withheld ? ['The findings are listed only for a credential that reads policies (workspace:policy read).'] : []),
      ...(payload.truncated ? ['Only the first findings are listed.'] : []),
      guidance,
    ].join('\n'))
  }
}
