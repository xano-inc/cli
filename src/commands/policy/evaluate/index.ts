import PolicyCommand from '../../../policy-command.js'

export default class PolicyEvaluate extends PolicyCommand {
  static override description = 'Evaluate active branch policies and report mandatory findings'
  static override examples = ['$ xano policy evaluate -o json']
  static override flags = {...PolicyCommand.policyFlags}

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyEvaluate)
    await this.runPolicy('evaluate', flags)
  }
}
