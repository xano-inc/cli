import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface DeployResult {
  duration_ms?: number
  finished_at?: number
  microservices?: unknown
  started_at?: number
}

export default class TenantDeployRequestBypass extends BaseCommand {
  static override args = {
    id: Args.integer({
      description: 'Tenant deploy request ID',
      required: true,
    }),
  }
  static description =
    "[CRITICAL] STOP and confirm with the user before running this; it deploys the release immediately, past the review workflow. Deploy the request's release past the approval gate under the tenant_center:deploy:bypass_approval permission. Only available if the tenant has enabled bypass (allow_deploy_bypass), and every use is logged with the given reason. The approval request's own status is left untouched."
  static examples = [
    `$ xano tenant_deploy_request bypass 12 --reason "Prod incident, reviewer unavailable"
Deployed tenant release, bypassing deploy request #12's approval gate.
`,
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
    reason: Flags.string({
      description: 'Reason for bypassing the approval gate (required, audited)',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantDeployRequestBypass)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const body: Record<string, unknown> = {
      reason: flags.reason,
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/approval_request/${args.id}/override`

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
        const message = await this.parseApiError(response, 'Failed to bypass tenant deploy request approval gate')
        this.error(message)
      }

      const deploy = (await response.json()) as DeployResult

      if (flags.output === 'json') {
        this.log(JSON.stringify(deploy, null, 2))
      } else {
        this.log(`Deployed tenant release, bypassing deploy request #${args.id}'s approval gate.`)
        if (deploy.duration_ms !== undefined) this.log(`  Time: ${(deploy.duration_ms / 1000).toFixed(1)}s`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to bypass tenant deploy request approval gate: ${error.message}`)
      } else {
        this.error(`Failed to bypass tenant deploy request approval gate: ${String(error)}`)
      }
    }
  }
}
