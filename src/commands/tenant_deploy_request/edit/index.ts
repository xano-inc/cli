import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface ApprovalRequest {
  description?: string
  id: number
  reviewers?: Array<{id: number}>
  status: string
  title: string
}

export default class TenantDeployRequestEdit extends BaseCommand {
  static override args = {
    id: Args.integer({
      description: 'Tenant deploy request ID',
      required: true,
    }),
  }
  static description = "Edit a tenant deploy request's title, description or reviewers. The author or an existing reviewer may do this."
  static examples = [
    `$ xano tenant_deploy_request edit 12 --title "Deploy v1.2.1 to prod"
Updated deploy request #12: "Deploy v1.2.1 to prod" [pending]
`,
    `$ xano tenant_deploy_request edit 12 --reviewers 12,45,67 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'New description',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    reviewers: Flags.string({
      description: 'Replacement comma-separated user IDs to request review from',
      required: false,
    }),
    title: Flags.string({
      description: 'New title',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantDeployRequestEdit)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const baseUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/approval_request/${args.id}`

    try {
      const getResponse = await this.verboseFetch(
        baseUrl,
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

      if (!getResponse.ok) {
        const message = await this.parseApiError(getResponse, 'Failed to fetch tenant deploy request')
        this.error(message)
      }

      const current = (await getResponse.json()) as ApprovalRequest

      const body: Record<string, unknown> = {
        description: flags.description !== undefined ? flags.description : (current.description ?? ''),
        reviewer_ids: flags.reviewers
          ? flags.reviewers.split(',').map((id) => Number.parseInt(id.trim(), 10))
          : (current.reviewers ?? []).map((r) => r.id),
        title: flags.title !== undefined ? flags.title : current.title,
      }

      const putResponse = await this.verboseFetch(
        baseUrl,
        {
          body: JSON.stringify(body),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'PUT',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!putResponse.ok) {
        const message = await this.parseApiError(putResponse, 'Failed to edit tenant deploy request')
        this.error(message)
      }

      const item = (await putResponse.json()) as ApprovalRequest

      if (flags.output === 'json') {
        this.log(JSON.stringify(item, null, 2))
      } else {
        this.log(`Updated deploy request #${item.id}: "${item.title}" [${item.status}]`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to edit tenant deploy request: ${error.message}`)
      } else {
        this.error(`Failed to edit tenant deploy request: ${String(error)}`)
      }
    }
  }
}
