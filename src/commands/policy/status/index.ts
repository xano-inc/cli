import {Flags} from '@oclif/core'

import PolicyCommand from '../../../policy-command.js'

export default class PolicyStatus extends PolicyCommand {
  static override description = 'Show the latest policy check results without evaluating'
  static override examples = ['$ xano policy status -o json', '$ xano policy status --fail-on-findings -o json', '$ xano policy status --run-detail']
  static override flags = {
    ...PolicyCommand.policyFlags,
    'fail-on-findings': Flags.boolean({
      default: false,
      description: 'Exit 1 for stale, missing or errored evaluation evidence; exit 2 for current mandatory findings',
    }),
    'run-detail': Flags.boolean({
      default: false,
      description: 'Also print what the latest run recorded: each policy description and the settings each rule ran with',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyStatus)
    await this.runPolicy('status', flags)
  }
}
