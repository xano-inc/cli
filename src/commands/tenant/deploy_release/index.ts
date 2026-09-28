import {Args, Flags} from '@oclif/core'

import BaseCommand, {type ProfileConfig} from '../../../base-command.js'
import {
  deployedGateLine,
  fetchPolicyGate,
  gateExitCode,
  gateLines,
  gateOverrideHint,
  gateRefusal,
  gateRefusalOutput,
  type GateRefused,
  type PolicyGateAnswer,
  quoted,
} from '../../../utils/policy/gate.js'
import {policyPermissionGuidance} from '../../../utils/policy/permission.js'

interface ApprovalRequest {
  _release?: {id?: number; name?: string}
  status: string
}

interface Tenant {
  deploy_settings?: {
    allow_quick_deploy?: boolean
    required_reviewers?: number
  }
  display?: string
  id: number
  name: string
  /** The policy gate's verdict on this deploy (`pass`, `overridden`, ...), when the platform gates releases. */
  policy_gate?: PolicyGateAnswer
  release?: {name?: string}
  state?: string
}

interface DeployReleaseFlags {
  output: string
  verbose: boolean
}

export default class TenantDeployRelease extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to deploy to',
      required: true,
    }),
  }
  static description =
    "[CRITICAL] STOP and confirm with the user before deploying a release to a tenant; this mutates the live tenant. Deploys a release to a tenant. A deploy is gated on the release's policy check: blocking findings it introduces, or a mandatory policy of the tenant's current release that it weakens, refuse it (exit 2) unless --override-reason is given. --check previews that verdict without deploying."
  static examples = [
    `$ xano tenant deploy_release t1234-abcd-xyz1 --release v1.0
Deployed release "v1.0" to tenant: My Tenant (my-tenant)
`,
    `$ xano tenant deploy_release t1234-abcd-xyz1 --release v1.0 -o json`,
    `$ xano tenant deploy_release prod --release v1.2 --check
Checked release "v1.2" against tenant "prod"; nothing was deployed.
Policy gate: blocked
  Deploy blocked: 1 blocking policy finding this release introduces.
`,
    `$ xano tenant deploy_release prod --release v1.2 --override-reason "Hotfix; AUTH-001 finding tracked in JIRA-12"`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    check: Flags.boolean({
      default: false,
      description: "Preview the release's policy gate on this tenant without deploying; exits 2 when the deploy would be refused",
      exclusive: ['override-reason'],
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    'override-reason': Flags.string({
      description: 'Deploy past a blocking policy gate, recording this reason (needs the workspace:policy update permission; audited)',
      exclusive: ['check'],
    }),
    release: Flags.string({
      char: 'r',
      description: 'Release name to deploy',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }
  /** Set once the policy gate refuses the deploy, the one failure that exits 2. */
  private refusedByPolicyGate = false

  /** Exit 2 is the policy gate's refusal; every other failure, flag errors included, exits 1. */
  protected override async catch(error: Error & {oclif?: {exit?: number}}): Promise<void> {
    if (this.refusedByPolicyGate) return super.catch(error)
    return this.catchAsOperational(error)
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantDeployRelease)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const releaseName = flags.release
    const tenantName = args.tenant_name

    if (flags.check) {
      await this.checkPolicyGate({flags, profile, releaseName, tenantName, workspaceId})
      return
    }

    const overrideReason = flags['override-reason']?.trim()
    if (flags['override-reason'] !== undefined && !overrideReason) {
      this.error('--override-reason needs a reason: say why this deploy may proceed past the policy gate.')
    }

    // Pre-flight: the "approval required" error must always be shown before any
    // permission/RBAC error. The backend's own deploy route checks RBAC first
    // and the approval gate second (inside mvp:tenant_deploy_release), so a
    // caller who lacks deploy permission would otherwise never learn a request
    // is what's actually needed. Checking here first, with an endpoint that
    // only needs read scope, guarantees the right error is shown regardless of
    // whether the caller can deploy at all.
    const requiresApproval = await this.tenantRequiresApproval(profile, workspaceId, tenantName, flags.verbose)
    if (requiresApproval) {
      const hasApprovedRequest = await this.hasApprovedDeployRequest({
        profile,
        releaseName,
        tenantName,
        verbose: flags.verbose,
        workspaceId,
      })
      if (!hasApprovedRequest) {
        this.error(
          `Tenant "${tenantName}" requires an approved deploy request before "${releaseName}" can be deployed.\n` +
            `Run: xano tenant_deploy_request create "Deploy ${releaseName} to ${tenantName}" --tenant ${tenantName} --release ${releaseName} --reviewers <id,id,...>`,
        )
      }
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/deploy`

    this.warn('This may take a few minutes. Please be patient.')

    const startTime = Date.now()
    // A refusal by the policy gate exits 2 with its verdict; the catch that rewords other failures keeps it.
    let refused: GateRefused | null = null

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({
            release_name: releaseName,
            ...(overrideReason ? {override_policy: true, override_reason: overrideReason} : {}),
          }),
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
        if (refused) {
          const override = `xano tenant deploy_release ${quoted(tenantName)} --release ${quoted(releaseName)} --override-reason "<why>"`
          this.refuseByPolicyGate(refused, flags, override)
        }

        let message = await this.parseApiError(response, 'API request failed')
        // Only reached once the pre-flight above has already confirmed the
        // approval gate is satisfied or not applicable — so a permission error
        // here is genuinely about RBAC, not about a missing approval. If the
        // tenant supports deploy requests, mention that path as an alternative
        // to direct deploy, since opening a request doesn't require deploy
        // permission.
        if ((response.status === 401 || response.status === 403) && requiresApproval) {
          message += `\n\nYou don't have permission to deploy to this tenant directly, but it supports deploy requests: xano tenant_deploy_request create "Deploy ${releaseName} to ${tenantName}" --tenant ${tenantName} --release ${releaseName} --reviewers <id,id,...>`
        }

        this.error(message)
      }

      const tenant = (await response.json()) as Tenant

      if (flags.output === 'json') {
        this.log(JSON.stringify(tenant, null, 2))
      } else {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        this.log(`Deployed release "${releaseName}" to tenant: ${tenant.display || tenant.name} (${tenant.name})`)
        if (tenant.state) this.log(`  State: ${tenant.state}`)
        if (tenant.release?.name) this.log(`  Release: ${tenant.release.name}`)
        if (tenant.policy_gate?.status) this.log(`  ${deployedGateLine(tenant.policy_gate)}`)
        this.log(`  Time: ${elapsed}s`)
      }
    } catch (error) {
      if (refused) throw error
      if (error instanceof Error) {
        this.error(`Failed to deploy to tenant: ${error.message}`)
      } else {
        this.error(`Failed to deploy to tenant: ${String(error)}`)
      }
    }
  }

  /**
   * `--check`: what the policy gate would decide for this release on this tenant, without deploying.
   * Exits 2 when the deploy would be refused; a preview the platform cannot answer exits 1.
   */
  private async checkPolicyGate(opts: {
    flags: DeployReleaseFlags
    profile: ProfileConfig
    releaseName: string
    tenantName: string
    workspaceId: string
  }): Promise<void> {
    const {flags, profile, releaseName, tenantName, workspaceId} = opts
    const result = await fetchPolicyGate(
      {verboseFetch: (...args) => this.verboseFetch(...args)},
      {profile, release: releaseName, tenant: tenantName, verbose: flags.verbose, workspace: workspaceId},
    )
    if ('unavailable' in result) {
      const {message, payload, status} = result.unavailable
      this.error(`Policy gate preview failed (${status}): ${message}${policyPermissionGuidance(status, payload)}`)
    }

    const {answer} = result
    const exit = gateExitCode(answer)
    if (flags.output === 'json') {
      this.log(JSON.stringify(answer, null, 2))
    } else {
      this.log(`Checked release "${releaseName}" against tenant "${tenantName}"; nothing was deployed.`)
      for (const line of gateLines(answer)) this.log(line)
      if (exit) {
        this.log(answer.can_override
          ? `To deploy past the gate: xano tenant deploy_release ${quoted(tenantName)} --release ${quoted(releaseName)} --override-reason "<why>"`
          : 'A deploy is refused unless someone with the workspace:policy update permission overrides the gate.')
      }
    }

    if (exit) process.exitCode = exit
  }

  /**
   * Does an approved tenant_deploy_request already exist for this (tenant, release)
   * pair? The list endpoint has no release filter, so this fetches approved
   * requests for the tenant and filters client-side by the resolved release name.
   */
  private async hasApprovedDeployRequest(opts: {
    profile: ProfileConfig
    releaseName: string
    tenantName: string
    verbose: boolean
    workspaceId: string
  }): Promise<boolean> {
    const {profile, releaseName, tenantName, verbose, workspaceId} = opts
    const params = new URLSearchParams({per_page: '100', status: 'approved', tenant_name: tenantName})
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/approval_request?${params}`

    const response = await this.verboseFetch(
      apiUrl,
      {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      },
      verbose,
      profile.access_token,
    )

    if (!response.ok) {
      // A read-scope failure here means something is more broadly wrong (e.g.
      // no workspace access at all) — surface it rather than silently treating
      // it as "no approval found", which would misreport as approval-required.
      const message = await this.parseApiError(response, 'Failed to check for an approved deploy request')
      this.error(message)
    }

    const data = (await response.json()) as ApprovalRequest[] | {items?: ApprovalRequest[]}
    const items = Array.isArray(data) ? data : (data.items ?? [])

    return items.some((item) => item.status === 'approved' && item._release?.name === releaseName)
  }

  /** A deploy the policy gate refused: its verdict, then the refusal and how to proceed, exiting 2. */
  private refuseByPolicyGate(refused: GateRefused, flags: DeployReleaseFlags, override: string): never {
    for (const line of gateRefusalOutput(refused, flags.output === 'json')) this.log(line)
    this.refusedByPolicyGate = true
    this.error(`${refused.message}${gateOverrideHint(refused.answer, override)}`, {exit: 2})
  }

  /**
   * Does this tenant have the deploy approval gate enabled?
   *
   * Returns false if the tenant has `allow_quick_deploy` set — that flag lets a
   * tenant skip the approval gate entirely for quick deploys, regardless of
   * `required_reviewers`.
   *
   * Deliberately uses `tenant list` rather than `tenant get`: the single-tenant
   * GET route's output whitelist (tenant-detail.yaml) omits `deploy_settings`
   * (which holds `required_reviewers`, `allow_deploy_bypass`, and
   * `allow_quick_deploy`) even though the list route's output includes it
   * — confirmed live against a running instance. Filed as a backend bug; this
   * is the workaround until it's fixed. See TENANT_DEPLOY_REQUEST_TEST.md.
   */
  private async tenantRequiresApproval(
    profile: ProfileConfig,
    workspaceId: string,
    tenantName: string,
    verbose: boolean,
  ): Promise<boolean> {
    const params = new URLSearchParams({per_page: '100'})
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant?${params}`

    const response = await this.verboseFetch(
      apiUrl,
      {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      },
      verbose,
      profile.access_token,
    )

    if (!response.ok) {
      const message = await this.parseApiError(response, 'Failed to look up tenant')
      this.error(message)
    }

    const data = (await response.json()) as Tenant[] | {items?: Tenant[]}
    const items = Array.isArray(data) ? data : (data.items ?? [])
    const tenant = items.find((item) => item.name === tenantName)

    if (tenant?.deploy_settings?.allow_quick_deploy) return false

    return (tenant?.deploy_settings?.required_reviewers ?? 0) > 0
  }
}
