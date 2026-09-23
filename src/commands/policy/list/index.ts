import type {Policy} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {listItems} from '../../../utils/policy/request.js'

export default class PolicyList extends PolicyCommand {
  static override description = 'List workspace policies and their descriptions'
  static override examples = ['$ xano policy list -o json']
  static override flags = {...PolicyCommand.policyFlags}

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyList)
    const {request} = this.policyTarget(flags)
    const result = await request()
    if (flags.output === 'json') {
      this.log(JSON.stringify(result, null, 2))
      return
    }

    const policies = listItems<Policy>(result)
    if (policies.length === 0) this.log('No policies found.')
    for (const policy of policies)
      this.log(`${policy.key}  ${policy.lifecycle}  ${policy.title ?? ''} (ID: ${policy.id}, Version ${policy.version})`)
  }
}
