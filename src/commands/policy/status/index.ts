import {Flags} from '@oclif/core'

import type {Policy, PolicyRun} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {policyResultSummary} from '../../../utils/policy/findings.js'
import {listItems} from '../../../utils/policy/request.js'
import {
  computeStatusRows,
  enforcementLabel,
  statusExitCode,
  statusExitReason,
  statusLabel,
} from '../../../utils/policy/status.js'

export default class PolicyStatus extends PolicyCommand {
  static override description = 'Show the latest policy check results without evaluating'
  static override examples = ['$ xano policy status -o json', '$ xano policy status --fail-on-findings -o json', '$ xano policy status --run-detail']
  static override flags = {
    ...PolicyCommand.policyFlags,
    'fail-on-findings': Flags.boolean({
      default: false,
      description: 'Exit 1 for stale, missing or errored evaluation evidence; exit 2 for current mandatory findings',
    }),
    'run-detail': Flags.boolean({
      default: false,
      description: 'Also print what the latest run recorded: each policy description and the settings each rule ran with',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyStatus)
    const {request} = this.policyTarget(flags)
    // Runs are newest-first; status only reads the latest one.
    const [listed, runs] = await Promise.all([request(), request('/run', 'GET', undefined, {limit: '1'})])
    const policies = listItems<Policy>(listed)
    const run = listItems<PolicyRun>(runs)[0]
    const rows = computeStatusRows(policies, run)
    const failOnFindings = flags['fail-on-findings'] ? {exit: statusExitCode(rows), reason: statusExitReason(rows)} : undefined
    if (flags.output === 'json') {
      this.log(JSON.stringify({policies, run: run ?? null, status: rows, ...(failOnFindings ? {fail_on_findings: failOnFindings} : {})}, null, 2))
    } else if (rows.length === 0) this.log('No policies found.')
    else {
      // A draft or stale row has no current count, and `0 findings` would read as "nothing wrong".
      for (const row of rows)
        this.log(`${row.key}  ${statusLabel(row)}  ${enforcementLabel(row)}  ${
          row.counted ? `${row.findings} findings` : '— findings'}  ${row.title ?? ''}`)
      const counted = new Set(rows.filter((row) => row.counted).map((row) => row.key))
      for (const line of policyResultSummary(run?.results?.filter((result) => counted.has(result.policy_key ?? '')))) this.log(line)
      if (flags['run-detail'] && run) this.logRunDetail(run)
      if (failOnFindings?.reason) this.log(failOnFindings.reason)
    }

    if (failOnFindings?.exit) process.exitCode = failOnFindings.exit
  }
}
