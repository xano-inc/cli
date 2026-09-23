import type {PolicyFinding, PolicyRuleResult, PolicySnapshotPolicy, PolicySnapshotRule} from './types.js'

/**
 * The platform's naming rule, shared with Studio: the author's title, then the check's human
 * label, then the rule id. Pass `label` from the run snapshot, or from the catalogue entry for
 * `check` when the caller already holds the catalogue; never fetch one just to name a rule.
 */
export function policyRuleName(rule: PolicySnapshotRule): string {
  return rule.title?.trim() || rule.label?.trim() || rule.id?.trim() || ''
}

/** Collision-free regardless of what a key or rule id contains. */
export const ruleKey = (policyKey = '', ruleId = '') => JSON.stringify([policyKey, ruleId])

export function snapshotRules(policies: PolicySnapshotPolicy[]): Map<string, PolicySnapshotRule> {
  return new Map(policies.flatMap(policy =>
    (policy.rules ?? []).map(rule => [ruleKey(policy.key, rule.id), rule] as const)))
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
export function findingLine(finding: PolicyFinding, rules: Map<string, PolicySnapshotRule>): string {
  // A rule the author left unnamed is called by its check's label, and only then by its id.
  const rule = findingName(finding, rules)
  const id = finding.rule_id?.trim()
  const policy = finding.policy_title || finding.policy_key || 'policy'
  const severity = finding.severity?.trim() ? ` [${finding.severity.trim()}]` : ''
  return `  ${[id, id === rule ? '' : rule].filter(Boolean).join('  ')}${severity} (${policy})  ${
    finding.object?.type ?? ''} ${finding.object?.name ?? ''}: ${finding.message ?? ''}`
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
