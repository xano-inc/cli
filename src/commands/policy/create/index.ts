import {Flags} from '@oclif/core'

import type {PolicyGoal} from '../../../utils/policy/goal.js'
import type {Policy} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {policy_from_goal} from '../../../utils/policy/goal.js'
import {listAllPolicies} from '../../../utils/policy/request.js'

export default class PolicyCreate extends PolicyCommand {
  static override description = 'Create an independent policy from a platform goal'
  static override examples = [
    '$ xano policy create --goal endpoints_need_login -b dev',
    `$ xano policy create --goal no_pii_in_responses --key DATA-020 --param 'fields=["email","ssn"]'`,
  ]
  static override flags = {
    ...PolicyCommand.policyFlags,
    ...PolicyCommand.publishFlags,
    goal: Flags.string({description: 'Goal id from policy catalogue -o json', required: true}),
    key: Flags.string({description: 'New policy key (default: the goal key with a free numeric suffix if taken)'}),
    param: Flags.string({description: 'Parameter override: N.path=JSON, 1-based rule number; path=JSON for a single-rule goal', multiple: true}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyCreate)
    const target = this.policyTarget(flags)
    const {request} = target
    const catalogue = await request('/check') as {goals?: PolicyGoal[]}
    const goal = catalogue.goals?.find(item => item.id === flags.goal)
    if (!goal) this.error(`Unknown goal "${flags.goal}". Run xano policy catalogue -o json to see this instance's goals.`)
    const keys = (await listAllPolicies(request)).map(policy => policy.key)
    const document = policy_from_goal(goal, keys, flags.key, flags.param)
    const parsed = await this.parseSource(request, {data: document})
    const saved = await request('', 'POST', {data: {source: parsed.source}, ...(flags.message ? {message: flags.message} : {})}) as Policy
    if (typeof saved?.id !== 'number') this.error('The platform did not return the saved policy. Check xano policy list before retrying.')
    this.logRuleWarnings(parsed)
    if (flags.output === 'json') this.log(JSON.stringify(saved, null, 2))
    else this.log(`Created ${parsed.policy.key} (Version ${saved.version}) in ${this.where(target)}.`)
  }
}
