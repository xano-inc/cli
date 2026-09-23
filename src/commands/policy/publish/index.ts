import type {Policy} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {listItems} from '../../../utils/policy/request.js'

export default class PolicyPublish extends PolicyCommand {
  static override args = {...PolicyCommand.sourceArgs}
  static override description = 'Create or update a workspace policy from native XanoScript'
  static override examples = [
    '$ xano policy publish policies/AUTH-001.xs',
    '$ xano policy publish --file policies/AUTH-001.xs',
    '$ xano policy publish --file policies/AUTH-001.xs -m "Tightened the scope"',
  ]
  static override flags = {...PolicyCommand.policyFlags, ...PolicyCommand.sourceFlags, ...PolicyCommand.publishFlags}

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PolicyPublish)
    const target = this.policyTarget(flags)
    const {request} = target
    const source = this.readSource(flags, args.file)
    // The key picks PUT or POST, so the list is read alongside the parse rather than after it.
    const [parsed, listed] = await Promise.all([this.parseSource(request, source), request()])
    const existing = listItems<Policy>(listed).find((policy) => policy.key === parsed.policy.key)
    const body: {data: {source: string}; message?: string} = {data: {source: parsed.source}}
    if (flags.message) body.message = flags.message
    const saved = (await request(existing ? `/${existing.id}` : '', existing ? 'PUT' : 'POST', body)) as {id?: unknown; unchanged?: unknown; version?: unknown}
    if (typeof saved?.id !== 'number') {
      this.error('The platform did not return the saved policy. Check `xano policy list` before retrying.')
    }

    if (flags.output === 'json') {
      this.log(JSON.stringify(saved, null, 2))
      return
    }

    // A save identical to the stored definition writes nothing: no version, history entry or audit record.
    this.log(saved.unchanged === true
      ? `No changes to ${parsed.policy.key} (Version ${saved.version}) in ${this.where(target)}.`
      : `Published ${parsed.policy.key} (Version ${saved.version}) to ${this.where(target)}.`)
  }
}
