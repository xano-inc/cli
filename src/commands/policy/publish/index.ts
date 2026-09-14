import PolicyCommand from '../../../policy-command.js'

export default class PolicyPublish extends PolicyCommand {
  static override description = 'Create or update a workspace policy from native XanoScript'
  static override examples = ['$ xano policy publish --file policies/AUTH-001.xs']
  static override flags = {...PolicyCommand.policyFlags, ...PolicyCommand.sourceFlags}

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyPublish)
    await this.runPolicy('publish', flags)
  }
}
