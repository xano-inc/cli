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
    await this.runPolicy('parse', flags, args.file)
  }
}
