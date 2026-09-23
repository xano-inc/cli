import {Args, Flags} from '@oclif/core'

import type {PolicyRun} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {listItems} from '../../../utils/policy/request.js'
import {policyRunSummary, policyRunTable} from '../../../utils/policy/runs.js'

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
    const {request} = this.policyTarget(flags)
    const wanted = args.run_id?.trim() ?? ''
    if (wanted === '') {
      if (flags['run-detail']) this.error('--run-detail reads one run: `xano policy runs <id> --run-detail`.')
      const result = await request('/run', 'GET', undefined, {limit: String(flags.limit)})
      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
        return
      }

      const runs = listItems<PolicyRun>(result)
      if (runs.length === 0) {
        this.log('No policy runs retained on this branch.')
        return
      }

      for (const line of policyRunTable(runs)) this.log(line)
      this.log('Only the most recent runs are retained per branch. Read one with `xano policy runs <id> --run-detail`.')
      return
    }

    // Runs older than the one `policy status` reads are reachable here by id.
    if (!/^\d+$/.test(wanted)) this.error(`"${wanted}" is not a run ID. Run \`xano policy runs\` for the retained runs.`)
    const run = (await request(`/run/${wanted}`)) as PolicyRun
    if (flags.output === 'json') {
      this.log(JSON.stringify(run, null, 2))
      return
    }

    for (const line of policyRunSummary(run)) this.log(line)
    if (flags['run-detail']) this.logRunDetail(run)
  }
}
