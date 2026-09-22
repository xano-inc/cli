import PolicyCommand from '../../../policy-command.js'

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
    await this.runPolicy('publish', flags, args.file)
  }
}
