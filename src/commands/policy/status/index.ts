import PolicyCommand from '../../../policy-command.js'

export default class PolicyStatus extends PolicyCommand {
  static override description = 'Show the latest policy check results without evaluating'
  static override examples = ['$ xano policy status -o json']
  static override flags = {...PolicyCommand.policyFlags}

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyStatus)
    await this.runPolicy('status', flags)
  }
}
