import {Args} from '@oclif/core'

import type {ObjectCoverage} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {coverageLines, parseObjectRef} from '../../../utils/policy/coverage.js'

export default class PolicyCoverage extends PolicyCommand {
  static override args = {
    object: Args.string({
      description: 'The object, written type:id as findings name it (query:42, function:12, table:7); for workspace, the workspace\'s own id (workspace:17)',
      required: true,
    }),
  }
  static override description =
    "Show which active policies apply to one object, why, and the object's findings in the branch's latest run, "
    + 'with each fix hint. Needs only the read permission for that object kind (workspace:api for an endpoint, '
    + 'workspace:function for a function, …), not workspace:policy; the answer leaves out policy details that need it.'
  static override examples = [
    '$ xano policy coverage query:42',
    '$ xano policy coverage function:12 -b dev -o json',
  ]
  static override flags = {...PolicyCommand.policyFlags}

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PolicyCoverage)
    const object = parseObjectRef(args.object)
    if (!object) this.error(`Name the object as type:id, as findings name it (for example query:42); got "${args.object}".`)
    const {request} = this.policyTarget(flags)
    const answer = (await request('/object/coverage', 'GET', undefined, {id: String(object.id), type: object.type})) as ObjectCoverage
    if (flags.output === 'json') {
      this.log(JSON.stringify(answer, null, 2))
      return
    }

    for (const line of coverageLines(answer)) this.log(line)
  }
}
