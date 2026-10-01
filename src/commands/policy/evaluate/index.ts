import {Flags} from '@oclif/core'

import type {PolicyEvaluation} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {
  evaluationEvidence,
  notStoredLine,
  policyCheckWarning,
  policyExitCode,
  policySummary,
} from '../../../utils/policy/feedback.js'

/** One rule's clear objects in a trial's answer: the first ones and how many there are. */
type TrialClear = {items?: Array<{name?: string}>; policy_key?: string; rule_id?: string; total?: number}

/** How many clear objects a trial names per rule; the rest are counted. */
const TRIAL_CLEAR_NAMES = 5

/**
 * What a trial says it is, then each rule's clear objects: the objects it examined and found
 * nothing on. A trial is never stored, so its answer is all there is to show.
 */
export function trialLines(key: string, clear: TrialClear[] | undefined): string[] {
  const lines = [`Trial of ${key}: this policy alone, evaluated without storing a run. It is not a report and gates nothing.`]
  if (!clear?.length) return lines
  lines.push('Clear objects (examined, nothing found):')
  for (const rule of clear) {
    const names = (rule.items ?? []).map((item) => item.name ?? '').filter(Boolean).slice(0, TRIAL_CLEAR_NAMES)
    const total = rule.total ?? 0
    const more = total > names.length ? `${names.length > 0 ? ', ' : ''}${total - names.length} more` : ''
    lines.push(`  ${rule.rule_id ?? ''}  ${total}${names.length > 0 || more ? `  ${names.join(', ')}${more}` : ''}`)
  }

  return lines
}

export default class PolicyEvaluate extends PolicyCommand {
  static override description = 'Evaluate active branch policies and report their findings; blocking findings exit 2. With --policy, try one policy alone, whatever its state, without storing a run'
  static override examples = ['$ xano policy evaluate -o json', '$ xano policy evaluate --run-detail', '$ xano policy evaluate --summary -o json', '$ xano policy evaluate --policy AUTH-001']
  static override flags = {
    ...PolicyCommand.policyFlags,
    policy: Flags.string({
      description: 'Try this one policy (its key) alone, whatever its state: nothing is stored, and the answer lists each rule\'s clear objects',
    }),
    'run-detail': Flags.boolean({
      default: false,
      description: 'Also print what this run recorded: each policy description and the settings each rule ran with',
    }),
    summary: Flags.boolean({
      default: false,
      description: 'Answer the run summary and its first 50 findings instead of the whole run; `xano policy runs <id>` pages through the rest',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyEvaluate)
    if (flags.policy !== undefined && !flags.policy.trim()) this.error('--policy must name a policy key.')
    const {request} = this.policyTarget(flags)
    // The evaluation answers with its run, so the run's own snapshot names any unnamed rule. The
    // summary answer carries the same snapshot and results, and only the first findings.
    const body = {...(flags.summary ? {answer: 'summary'} : {}), ...(flags.policy ? {policy: flags.policy} : {})}
    const result = (await request('/evaluate', 'POST', Object.keys(body).length > 0 ? body : undefined)) as PolicyEvaluation & {clear?: TrialClear[]}
    if (flags.output === 'json') this.log(JSON.stringify(result, null, 2))
    else {
      for (const line of policySummary(result.policy_check, evaluationEvidence(result))) this.log(line)
      // A trial is never stored by design; the "cannot record runs" note is about credentials.
      const notStored = flags.policy ? null : notStoredLine(result)
      if (notStored) this.log(notStored)
      if (flags.policy) for (const line of trialLines(flags.policy, result.clear)) this.log(line)
      if (flags['run-detail']) this.logRunDetail(result)
    }

    const warning = policyCheckWarning(result.policy_check)
    if (warning) this.warn(warning)
    const code = policyExitCode(result.policy_check)
    if (code) process.exitCode = code
  }
}
