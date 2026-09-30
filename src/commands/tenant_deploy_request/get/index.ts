import {Args, Flags} from '@oclif/core'

import BaseCommand, {type ProfileConfig} from '../../../base-command.js'
import {fetchPolicyGate, gateLines, type PolicyGateAnswer, unavailableReason} from '../../../utils/policy/gate.js'

interface ApprovalRequest {
  /** The request's release and tenant by name, as the platform resolves them. */
  _release?: {id?: number; name?: string}
  _tenant?: {id?: number; name?: string}
  author?: {id: number}
  can_review?: boolean
  deployment?: {base_release?: {id?: number}; release?: {id?: number}; tenant?: {id?: number}}
  description?: string
  id: number
  is_author?: boolean
  reviewers?: Array<{id: number}>
  status: string
  title: string
}

export default class TenantDeployRequestGet extends BaseCommand {
  static override args = {
    id: Args.integer({
      description: 'Tenant deploy request ID',
      required: true,
    }),
  }
  static description =
    "Get details of a specific tenant deploy request, with the policy check of its release on its tenant (what the deploy's policy gate would decide now), for a credential that reads policies"
  static examples = [
    `$ xano tenant_deploy_request get 12
Deploy request #12: "Deploy v1.2 to prod" [pending]
  Tenant: prod
  Release: v1.2
Policy check of release "v1.2" on tenant "prod":
Policy gate: pass
  This release has no blocking policy findings.
  Release: v1.2 (policy run 301, pass)
  Blocking findings in this release: 0
`,
    `$ xano tenant_deploy_request get 12 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantDeployRequestGet)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/approval_request/${args.id}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
          },
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const message = await this.parseApiError(response, 'Failed to get tenant deploy request')
        this.error(message)
      }

      const item = (await response.json()) as ApprovalRequest
      const policyCheck = await this.policyCheck(item, {profile, verbose: flags.verbose, workspaceId})

      if (flags.output === 'json') {
        this.log(JSON.stringify({...item, policy_gate: policyCheck.answer ?? null,
          ...(policyCheck.unavailable ? {policy_gate_unavailable: policyCheck.unavailable} : {})}, null, 2))
      } else {
        this.log(`Deploy request #${item.id}: "${item.title}" [${item.status}]`)
        this.log(`  Tenant: ${item._tenant?.name || (item.deployment?.tenant?.id ? `#${item.deployment.tenant.id}` : 'unavailable')}`)
        this.log(`  Release: ${item._release?.name || (item.deployment?.release?.id ? `#${item.deployment.release.id}` : 'unavailable')}`)
        if (item.description) this.log(`  Description: ${item.description}`)
        if (item.reviewers?.length) this.log(`  Reviewers: ${item.reviewers.map((r) => r.id).join(', ')}`)
        if (item.can_review !== undefined) this.log(`  Can review: ${item.can_review}`)
        if (policyCheck.answer) {
          this.log(`Policy check of release "${item._release?.name}" on tenant "${item._tenant?.name}":`)
          for (const line of gateLines(policyCheck.answer)) this.log(line)
        } else if (policyCheck.unavailable) {
          this.log(`Policy checks: not available (${policyCheck.unavailable})`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get tenant deploy request: ${error.message}`)
      } else {
        this.error(`Failed to get tenant deploy request: ${String(error)}`)
      }
    }
  }

  /**
   * The policy gate's verdict on the request's release for its tenant, as a deploy now would meet it.
   * Only a policy reader gets one; any refusal or failure is a reason it is not available, never an
   * error of this command.
   */
  private async policyCheck(
    item: ApprovalRequest,
    target: {profile: ProfileConfig; verbose: boolean; workspaceId: string},
  ): Promise<{answer?: PolicyGateAnswer; unavailable?: string}> {
    // Terminal requests are historical records: previewing now can check a different base release.
    if (['approved', 'closed'].includes(item.status)) return {}
    const tenant = item._tenant?.name?.trim()
    const release = item._release?.name?.trim()
    if (!tenant || !release) return {unavailable: 'the request does not name its tenant and release'}
    try {
      const result = await fetchPolicyGate(
        {verboseFetch: (...args) => this.verboseFetch(...args)},
        {profile: target.profile, release, tenant, verbose: target.verbose, workspace: String(target.workspaceId)},
      )
      return 'answer' in result ? {answer: result.answer} : {unavailable: unavailableReason(result.unavailable)}
    } catch (error) {
      return {unavailable: error instanceof Error ? error.message : String(error)}
    }
  }
}
