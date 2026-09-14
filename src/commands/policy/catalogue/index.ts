import PolicyCommand from '../../../policy-command.js'

export default class PolicyCatalogue extends PolicyCommand {
  static override description = 'List built-in policy checks and their parameter schemas'
  static override examples = ['$ xano policy catalogue -o json']
  static override flags = {...PolicyCommand.policyFlags}

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyCatalogue)
    await this.runPolicy('catalogue', flags)
  }
}
