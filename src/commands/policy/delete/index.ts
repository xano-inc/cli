import {Args, Flags} from '@oclif/core'

import type {Policy} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {confirm} from '../../../utils/multidoc-push.js'
import {listItems} from '../../../utils/policy/request.js'

export default class PolicyDelete extends PolicyCommand {
  static override args = {
    policy: Args.string({
      description: 'Policy key (AUTH-001) or ID to delete',
      required: true,
    }),
  }
  static override description = 'Delete a policy from a branch; its Version History is kept'
  static override examples = [
    `$ xano policy delete TMP-DX-001
Delete policy TMP-DX-001 (ID: 922, Version 2) from workspace 3? Its Version History is kept. (y/N) y
Deleted policy TMP-DX-001 (ID: 922) from workspace 3.
`,
    '$ xano policy delete 922 --force',
    '$ xano policy delete TMP-DX-001 -w 3 --force -o json',
  ]
  static override flags = {
    ...PolicyCommand.policyFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: '[IMPORTANT] NEVER run without explicit user confirmation. Skips the confirmation prompt.',
    }),
  }

  /** `workspace push` is additive, so deleting a policy file leaves the policy in place; this removes it. */
  async run(): Promise<void> {
    const {args, flags} = await this.parse(PolicyDelete)
    const target = this.policyTarget(flags)
    const wanted = args.policy.trim()
    if (!wanted) this.error('Provide the policy key or ID to delete.')
    const policies = listItems<Policy>(await target.request())
    const matched = policies.find((policy) => policy.key === wanted)
      ?? (/^\d+$/.test(wanted) ? policies.find((policy) => policy.id === Number(wanted)) : undefined)
    if (!matched) {
      const known = policies.map((policy) => policy.key).sort()
      this.error(`No policy "${wanted}" on ${this.where(target)}.${
        known.length > 0 ? ` This branch has: ${known.join(', ')}.` : ' This branch has no policies.'}`)
    }

    if (!flags.force) {
      const confirmed = await confirm(
        `Delete policy ${matched.key} (ID: ${matched.id}, Version ${matched.version}) from ${this.where(target)}? Its Version History is kept.`,
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    // The policy as listed is what the prompt named: a delete of a policy changed since is refused (`policy_stale`).
    const staleCheck: Record<string, string> = matched.updated_at ? {last_updated_at: String(matched.updated_at)} : {}
    await target.request(`/${matched.id}`, 'DELETE', undefined, staleCheck)
    if (flags.output === 'json') this.log(JSON.stringify({deleted: true, id: matched.id, key: matched.key}, null, 2))
    else this.log(`Deleted policy ${matched.key} (ID: ${matched.id}) from ${this.where(target)}.`)
  }
}
