import {Args, Flags} from '@oclif/core'

import PolicyCommand from '../../../policy-command.js'

export default class PolicyRuns extends PolicyCommand {
  static override args = {
    run_id: Args.string({
      description: 'Run ID to read; omit to list the retained runs, newest first',
      required: false,
    }),
  }
  static override description = 'List the stored policy check runs, or read one of them'
  static override examples = [
    '$ xano policy runs',
    '$ xano policy runs --limit 5',
    '$ xano policy runs 1674 --run-detail',
    '$ xano policy runs 1674 -o json',
  ]
  static override flags = {
    ...PolicyCommand.policyFlags,
    limit: Flags.integer({
      default: 20,
      description: 'How many runs to list, newest first',
    }),
    'run-detail': Flags.boolean({
      default: false,
      description: 'With a run ID, also print the policy descriptions and rule settings that run recorded',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(PolicyRuns)
    await this.runPolicy('runs', flags, args.run_id)
  }
}
