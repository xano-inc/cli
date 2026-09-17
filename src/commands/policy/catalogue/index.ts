import {Flags} from '@oclif/core'

import PolicyCommand from '../../../policy-command.js'

export default class PolicyCatalogue extends PolicyCommand {
  static override description = 'List built-in policy checks and their parameter schemas'
  static override examples = ['$ xano policy catalogue -o json', '$ xano policy catalogue --check query.auth_required']
  static override flags = {
    ...PolicyCommand.policyFlags,
    check: Flags.string({description: 'Show only this check id (an unknown id names the closest matches)'}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyCatalogue)
    await this.runPolicy('catalogue', flags)
  }
}
