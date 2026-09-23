import {Flags} from '@oclif/core'

import type {PolicyCheck, PolicyRun} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {policyCheckWarning, policyExitCode, policySummary} from '../../../utils/policy/feedback.js'

export default class PolicyEvaluate extends PolicyCommand {
  static override description = 'Evaluate active branch policies and report mandatory findings'
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
    // The evaluation answers with the stored run, so its own snapshot names any unnamed rule.
    const result = (await request('/evaluate', 'POST', {trigger: 'manual'})) as PolicyRun & {policy_check?: PolicyCheck}
    if (flags.output === 'json') this.log(JSON.stringify(result, null, 2))
    else {
      for (const line of policySummary(result.policy_check, result.policies ?? [])) this.log(line)
      if (flags['run-detail']) this.logRunDetail(result)
    }

    const warning = policyCheckWarning(result.policy_check)
    if (warning) this.warn(warning)
    const code = policyExitCode(result.policy_check)
    if (code) process.exitCode = code
  }
}
