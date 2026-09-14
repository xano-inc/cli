import PolicyCommand from '../../../policy-command.js'

export default class PolicyList extends PolicyCommand {
  static override description = 'List workspace policies and their descriptions'
  static override examples = ['$ xano policy list -o json']
  static override flags = {...PolicyCommand.policyFlags}

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyList)
    await this.runPolicy('list', flags)
  }
}
