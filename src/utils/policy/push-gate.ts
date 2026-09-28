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

/** Preserve a gate refusal through shared push and operational-error wrappers. */
export class PushPolicyGateError extends Error {
  constructor(readonly payload: Record<string, unknown>) {
    const count = (key: string) => typeof payload[key] === 'number' ? payload[key] : 0
    const findings: unknown[] = Array.isArray(payload.findings) ? payload.findings.slice(0, 100) : []
    const lines = findings.flatMap(finding => finding && typeof finding === 'object' ? [refusedFindingLine(finding as PolicyFinding)] : [])
    const guidance = payload.can_override === true && payload.override_denied !== true
      ? 'To proceed with an audited reason, retry with --policy-override "reason".'
      : 'Fix the findings or ask someone with workspace:policy update permission to override with a reason.'
    const total = count('total')
    super([
      `Push refused: ${total} blocking policy finding${total === 1 ? '' : 's'} (${count('introduced')} introduced, ${count('changed')} on changed objects). Nothing was imported.`,
      ...lines,
      ...(payload.truncated ? ['Only the first findings are listed.'] : []),
      guidance,
    ].join('\n'))
  }
}
