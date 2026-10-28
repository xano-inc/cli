import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {gateOverrideHint, gateRefusal, gateRefusalOutput, type GateRefused, quoted} from '../../../utils/policy/gate.js'

interface ApprovalRequest {
  approvals_count?: number
  fully_approved?: boolean
  id: number
  required_reviewers?: number
  resolution?: {deploy_error?: string; deploy_status?: string}
  status: string
  title: string
}

export default class TenantDeployRequestSetStatus extends BaseCommand {
  static override args = {
    id: Args.integer({
      description: 'Tenant deploy request ID',
      required: true,
    }),
  }
  static description =
    "[CRITICAL] STOP and confirm with the user before running --status approve --deploy; if this is the vote that completes the tenant's required reviewer count, it deploys the release to the tenant immediately. Change a tenant deploy request's status (draft, submit, approve, request_changes, close, or reopen). Approving records one reviewer's vote and, once the required reviewer count is met, authorizes the release; by default it does NOT deploy. Pass --deploy to also deploy the release inline (the UI's \"approve and deploy\"), which the backend honors only on a quick-deploy tenant; otherwise the release is left for `xano tenant deploy_release`."
  static examples = [
    `$ xano tenant_deploy_request set_status 12 --status submit
Deploy request #12 is now: pending
`,
    `$ xano tenant_deploy_request set_status 12 --status approve
Vote recorded on deploy request #12: 1/2 required reviewers.
`,
    `$ xano tenant_deploy_request set_status 12 --status approve
Deploy request #12 is now: approved (2/2 required reviewers)
The release is approved but not yet deployed. Deploy it with: xano tenant deploy_release <tenant> --release <release> (\`xano tenant_deploy_request get 12\` names the tenant and release).
`,
    `$ xano tenant_deploy_request set_status 12 --status approve --deploy
Deploy request #12 is now: approved (2/2 required reviewers)
Deployed to tenant as part of this approval.
`,
    `$ xano tenant_deploy_request set_status 12 --status request_changes --reason "Needs a migration note"`,
    `$ xano tenant_deploy_request set_status 12 --status close --reason "Superseded by #14"`,
    `$ xano tenant_deploy_request set_status 12 --status reopen`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    deploy: Flags.boolean({
      default: false,
      description:
        "With --status approve: also deploy the release inline (sends auto_deploy: true), reproducing the UI's \"approve and deploy\". The backend deploys inline only on a quick-deploy tenant; otherwise the approve is recorded and the release is left for `xano tenant deploy_release`. Default: approve only, no deploy.",
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    'override-policy': Flags.boolean({
      default: false,
      description: 'With --status approve --deploy: proceed past a blocking policy gate on the inline deploy, recording --reason as the override reason (needs the workspace:policy update permission; audited). Has effect only with --deploy — only an inline deploy hits the gate.',
      hidden: true,
    }),
    reason: Flags.string({
      description: 'Reason for this status change. Required for request_changes and close.',
      required: false,
    }),
    status: Flags.string({
      description: 'The status transition to apply',
      options: ['draft', 'submit', 'approve', 'request_changes', 'close', 'reopen'],
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }
  /** Set once the policy gate refuses the deploy an approval triggered, the one failure that exits 2. */
  private refusedByPolicyGate = false

  /** Exit 2 is the policy gate's refusal; every other failure, flag errors included, exits 1. */
  protected override async catch(error: Error & {oclif?: {exit?: number}}): Promise<void> {
    if (this.refusedByPolicyGate) return super.catch(error)
    return this.catchAsOperational(error)
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantDeployRequestSetStatus)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    if ((flags.status === 'request_changes' || flags.status === 'close') && !flags.reason) {
      this.error(`--reason is required when --status is "${flags.status}"`)
    }

    if (flags.deploy && flags.status !== 'approve') {
      this.error('--deploy applies only to --status approve, the vote that can deploy.')
    }

    if (flags['override-policy']) this.checkOverride(flags)

    const body: Record<string, unknown> = {
      action: flags.status,
      reason: flags.reason ?? '',
      ...(flags['override-policy'] ? {override_policy: true} : {}),
      ...(flags.deploy ? {auto_deploy: true} : {}),
    }

    // A refusal by the policy gate exits 2 with its verdict; the catch that rewords other failures keeps it.
    let refused: GateRefused | null = null

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/approval_request/${args.id}/status`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        refused = await gateRefusal(response)
        if (refused) this.refuseByPolicyGate(refused, args.id, flags.output === 'json')
        const message = await this.parseApiError(response, 'Failed to change tenant deploy request status')
        this.error(message)
      }

      const item = (await response.json()) as ApprovalRequest

      if (flags.output === 'json') {
        this.log(JSON.stringify(item, null, 2))
      } else if (flags.status === 'approve' && item.fully_approved === false) {
        // required_reviewers > 1: this vote didn't complete the quorum, so status
        // stays "pending" and nothing was deployed yet.
        this.log(`Vote recorded on deploy request #${item.id}: ${item.approvals_count}/${item.required_reviewers} required reviewers.`)
      } else {
        const quorum =
          item.approvals_count !== undefined && item.required_reviewers !== undefined
            ? ` (${item.approvals_count}/${item.required_reviewers} required reviewers)`
            : ''
        this.log(`Deploy request #${item.id} is now: ${item.status}${quorum}`)
        if (flags.status === 'approve') {
          if (item.resolution?.deploy_status === 'deployed') {
            this.log('Deployed to tenant as part of this approval.')
          } else if (item.resolution?.deploy_status === 'failed') {
            this.log(`Approved, but the deploy failed: ${item.resolution.deploy_error ?? 'unknown error'}`)
          } else if (item.status === 'approved') {
            // deploy_status "" or absent: the quorum is complete and the release is authorized, but it
            // was not deployed (a bare approve, or --deploy on a tenant without quick deploy). Say so and
            // name the next step, rather than printing nothing. Gated on the status so a vote that left
            // the request pending never reads as approved.
            this.log(`The release is approved but not yet deployed. Deploy it with: xano tenant deploy_release <tenant> --release <release> (\`xano tenant_deploy_request get ${item.id}\` names the tenant and release).`)
          }
        }
      }
    } catch (error) {
      if (refused) throw error
      if (error instanceof Error) {
        this.error(`Failed to change tenant deploy request status: ${error.message}`)
      } else {
        this.error(`Failed to change tenant deploy request status: ${String(error)}`)
      }
    }
  }

  /**
   * `--override-policy` overrides the policy gate on the inline deploy a `--deploy` approve triggers, and
   * its reason is `--reason`. Post-DEV-8728 only an inline deploy hits the gate, so it requires `--deploy`.
   */
  private checkOverride(flags: {deploy: boolean; reason?: string; status: string}): void {
    if (flags.status !== 'approve') this.error('--override-policy applies only to --status approve, the vote that can deploy.')
    if (!flags.deploy) this.error('--override-policy has effect only with --deploy: only an inline deploy hits the policy gate.')
    if (!flags.reason?.trim()) this.error('--override-policy needs --reason: say why this deploy may proceed past the policy gate.')
  }

  /**
   * The deploy this approval triggered was refused by the policy gate: its verdict, then the refusal,
   * exiting 2. The vote that completes the approvals is recorded before the deploy, so the request
   * stays approved, and a later deploy of the pair that overrides the gate completes it.
   */
  private refuseByPolicyGate(refused: GateRefused, id: number, json: boolean): never {
    for (const line of gateRefusalOutput(refused, json)) this.log(line)
    const approved = refused.answer.gate === 'tenant_approve'
      ? '\nYour approval was recorded and the request is approved, but its release was not deployed.'
      : ''
    const release = refused.answer.release?.name?.trim()
    const override = `xano tenant deploy_release <tenant> --release ${release ? quoted(release) : '<release>'} --override-reason "<why>" (\`xano tenant_deploy_request get ${id}\` names the tenant)`
    this.refusedByPolicyGate = true
    this.error(`${refused.message}${approved}${gateOverrideHint(refused.answer, override)}`, {exit: 2})
  }
}
