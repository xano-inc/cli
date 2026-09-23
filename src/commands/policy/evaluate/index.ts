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

export default class PolicyEvaluate extends PolicyCommand {
  static override description = 'Evaluate active branch policies and report their findings; blocking findings exit 2'
  static override examples = ['$ xano policy evaluate -o json', '$ xano policy evaluate --run-detail']
  static override flags = {
    ...PolicyCommand.policyFlags,
    'run-detail': Flags.boolean({
      default: false,
      description: 'Also print what this run recorded: each policy description and the settings each rule ran with',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyEvaluate)
    const {request} = this.policyTarget(flags)
    // The evaluation answers with its run, so the run's own snapshot names any unnamed rule.
    const result = (await request('/evaluate', 'POST')) as PolicyEvaluation
    if (flags.output === 'json') this.log(JSON.stringify(result, null, 2))
    else {
      for (const line of policySummary(result.policy_check, evaluationEvidence(result))) this.log(line)
      const notStored = notStoredLine(result)
      if (notStored) this.log(notStored)
      if (flags['run-detail']) this.logRunDetail(result)
    }

    const warning = policyCheckWarning(result.policy_check)
    if (warning) this.warn(warning)
    const code = policyExitCode(result.policy_check)
    if (code) process.exitCode = code
  }
}
