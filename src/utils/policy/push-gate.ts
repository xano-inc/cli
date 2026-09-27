/** Preserve a gate refusal through shared push and operational-error wrappers. */
export class PushPolicyGateError extends Error {
  constructor(readonly payload: Record<string, unknown>) {
    const count = (key: string) => typeof payload[key] === 'number' ? payload[key] : 0
    const findings = Array.isArray(payload.findings) ? payload.findings.slice(0, 100) : []
    const lines = findings.flatMap(finding => typeof finding?.message === 'string' ? [`  - ${finding.message}`] : [])
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
