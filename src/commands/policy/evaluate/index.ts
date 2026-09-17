import {Flags} from '@oclif/core'

import PolicyCommand from '../../../policy-command.js'

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
    await this.runPolicy('evaluate', flags)
  }
}
