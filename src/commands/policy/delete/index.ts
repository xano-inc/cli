import {Args, Flags} from '@oclif/core'

import PolicyCommand from '../../../policy-command.js'

export default class PolicyDelete extends PolicyCommand {
  static override args = {
    policy: Args.string({
      description: 'Policy key (AUTH-001) or ID to delete',
      required: true,
    }),
  }
  static override description = 'Delete a policy and its Version History from a branch'
  static override examples = [
    `$ xano policy delete TMP-DX-001
Delete policy TMP-DX-001 (ID: 922, Version 2) from workspace 3? Its Version History goes with it. (y/N) y
Deleted policy TMP-DX-001 (ID: 922) from workspace 3.
`,
    '$ xano policy delete 922 --force',
    '$ xano policy delete TMP-DX-001 -w 3 --force -o json',
  ]
  static override flags = {
    ...PolicyCommand.policyFlags,
    force: Flags.boolean({
      aliases: ['yes'],
      char: 'f',
      default: false,
      description: '[IMPORTANT] NEVER run without explicit user confirmation. Skips the confirmation prompt.',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PolicyDelete)
    await this.runPolicy('delete', flags, args.policy)
  }
}
