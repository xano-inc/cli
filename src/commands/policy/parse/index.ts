import PolicyCommand from '../../../policy-command.js'
import {examplePolicyLines} from '../../../utils/policy/example.js'

export default class PolicyParse extends PolicyCommand {
  static override args = {...PolicyCommand.sourceArgs}
  static override description = 'Validate and format policy XanoScript using the platform parser, with rule warnings against the branch'
  static override examples = [
    '$ xano policy parse policies/AUTH-001.xs',
    '$ xano policy parse --file policies/AUTH-001.xs',
  ]
  static override flags = {...PolicyCommand.policyFlags, ...PolicyCommand.sourceFlags}
  /** Shown verbatim in its own help section (see help.ts): a person reading this help has not seen a policy file yet. */
  static policyFileExample = examplePolicyLines('A minimal policy file (`xano policy catalogue` lists the checks, their params and the scope fields):')

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PolicyParse)
    const {request} = this.policyTarget(flags)
    const parsed = await this.parseSource(request, {source: this.readSource(flags, args.file)})
    this.log(flags.output === 'json' ? JSON.stringify(parsed, null, 2) : parsed.source)
    if (flags.output !== 'json') this.logRuleWarnings(parsed)
  }
}
