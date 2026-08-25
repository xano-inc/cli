import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface ApprovalRequest {
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
  static description = 'Get details of a specific tenant deploy request'
  static examples = [
    `$ xano tenant_deploy_request get 12
Deploy request #12: "Deploy v1.2 to prod" [pending]
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

      if (flags.output === 'json') {
        this.log(JSON.stringify(item, null, 2))
      } else {
        this.log(`Deploy request #${item.id}: "${item.title}" [${item.status}]`)
        if (item.description) this.log(`  Description: ${item.description}`)
        if (item.reviewers?.length) this.log(`  Reviewers: ${item.reviewers.map((r) => r.id).join(', ')}`)
        if (item.can_review !== undefined) this.log(`  Can review: ${item.can_review}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get tenant deploy request: ${error.message}`)
      } else {
        this.error(`Failed to get tenant deploy request: ${String(error)}`)
      }
    }
  }
}
