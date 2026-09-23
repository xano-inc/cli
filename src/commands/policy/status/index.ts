import {Flags} from '@oclif/core'

import type {Policy, PolicyRun} from '../../../utils/policy/types.js'

import PolicyCommand from '../../../policy-command.js'
import {policyResultSummary} from '../../../utils/policy/findings.js'
import {listItems, type PolicyRequest} from '../../../utils/policy/request.js'
import {
  computeStatusRows,
  enforcementLabel,
  findingsLabel,
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
      description: 'Exit 2 for current blocking findings, whatever else is true; otherwise exit 1 for stale, missing or errored evaluation evidence',
    }),
    'run-detail': Flags.boolean({
      default: false,
      description: 'Also print what the latest run recorded: each policy description and the settings each rule ran with',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(PolicyStatus)
    const {request} = this.policyTarget(flags)
    const policies = listItems<Policy>(await request())
    const run = await this.latestRun(request, policies)
    const rows = computeStatusRows(policies, run)
    const failOnFindings = flags['fail-on-findings'] ? {exit: statusExitCode(rows), reason: statusExitReason(rows)} : undefined
    if (flags.output === 'json') {
      this.log(JSON.stringify({policies, run: run ?? null, status: rows, ...(failOnFindings ? {fail_on_findings: failOnFindings} : {})}, null, 2))
    } else if (rows.length === 0) this.log('No policies found.')
    else {
      for (const row of rows)
        this.log(`${row.key}  ${statusLabel(row)}  ${enforcementLabel(row.enforcement)}  ${findingsLabel(row)}  ${row.title ?? ''}`)
      const counted = new Set(rows.filter((row) => row.counted).map((row) => row.key))
      for (const line of policyResultSummary(run?.results?.filter((result) => counted.has(result.policy_key ?? '')))) this.log(line)
      if (flags['run-detail'] && run) this.logRunDetail(run)
      if (failOnFindings?.reason) this.log(failOnFindings.reason)
    }

    if (failOnFindings?.exit) process.exitCode = failOnFindings.exit
  }

  /** The run every policy's `latest_run` answer was decided against, or none when the branch has no run. */
  private async latestRun(request: PolicyRequest, policies: Policy[]): Promise<PolicyRun | undefined> {
    const runId = policies.map((policy) => policy.latest_run?.run_id).find(Boolean)
    return runId ? (await request(`/run/${runId}`)) as PolicyRun : undefined
  }
}
