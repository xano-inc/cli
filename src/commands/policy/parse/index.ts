import PolicyCommand from '../../../policy-command.js'

export default class PolicyParse extends PolicyCommand {
  static override args = {...PolicyCommand.sourceArgs}
  static override description = 'Validate and format policy XanoScript using the platform parser'
  static override examples = [
    '$ xano policy parse policies/AUTH-001.xs',
    '$ xano policy parse --file policies/AUTH-001.xs',
  ]
  static override flags = {...PolicyCommand.policyFlags, ...PolicyCommand.sourceFlags}

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PolicyParse)
    const {request} = this.policyTarget(flags)
    const parsed = await this.parseSource(request, this.readSource(flags, args.file))
    this.log(flags.output === 'json' ? JSON.stringify(parsed, null, 2) : parsed.source)
  }
}
