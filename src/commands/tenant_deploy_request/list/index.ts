import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface ApprovalRequest {
  _release?: {id?: number; name?: string}
  _tenant?: {display?: string; id?: number; name?: string}
  author?: {id: number}
  can_review?: boolean
  deployment?: {release?: {id?: number}; tenant?: {id?: number}}
  id: number
  is_author?: boolean
  status: string
  title: string
  updated_at?: number | string
}

export default class TenantDeployRequestList extends BaseCommand {
  static description = 'List tenant deploy requests (deployment approval requests) in a workspace'
  static examples = [
    `$ xano tenant_deploy_request list
Deploy requests in workspace 5:
  - #12 "Deploy v1.2 to prod" [pending] -> prod / v1.2
`,
    `$ xano tenant_deploy_request list --tenant prod --status pending`,
    `$ xano tenant_deploy_request list --tenant prod --release v1.2`,
    `$ xano tenant_deploy_request list --to-review -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    mine: Flags.boolean({
      default: false,
      description: 'Only requests you authored',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    page: Flags.integer({
      default: 1,
      description: 'Page number',
      required: false,
    }),
    'per-page': Flags.integer({
      default: 25,
      description: 'Items per page',
      required: false,
    }),
    release: Flags.string({
      char: 'r',
      description:
        'Filter to requests targeting this release. Applied client-side (the API has no release filter), after --page/--per-page, so a narrow page size can hide matches on other pages.',
      required: false,
    }),
    status: Flags.string({
      description: 'Filter by status',
      options: ['draft', 'pending', 'changes_requested', 'approved', 'closed'],
      required: false,
    }),
    tenant: Flags.string({
      description: 'Filter to requests targeting this tenant',
      required: false,
    }),
    'to-review': Flags.boolean({
      default: false,
      description: 'Only requests you are able to review',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(TenantDeployRequestList)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const params = new URLSearchParams()
    if (flags.status) params.set('status', flags.status)
    if (flags.tenant) params.set('tenant_name', flags.tenant)
    if (flags.mine) params.set('mine', 'true')
    if (flags['to-review']) params.set('to_review', 'true')
    params.set('page', String(flags.page))
    params.set('per_page', String(flags['per-page']))

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/approval_request?${params}`

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
        const message = await this.parseApiError(response, 'Failed to list tenant deploy requests')
        this.error(message)
      }

      const data = (await response.json()) as ApprovalRequest[] | {items?: ApprovalRequest[]}
      const allItems = Array.isArray(data) ? data : (data.items ?? [])
      const items = flags.release ? allItems.filter((item) => item._release?.name === flags.release) : allItems

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else if (items.length === 0) {
        this.log('No tenant deploy requests found')
      } else {
        this.log(`Deploy requests in workspace ${workspaceId}:`)
        for (const item of items) {
          const review = item.can_review ? ' (reviewable)' : ''
          const tenantName = item._tenant?.name ?? '?'
          const releaseName = item._release?.name ?? '?'
          this.log(`  - #${item.id} "${item.title}" [${item.status}]${review} -> ${tenantName} / ${releaseName}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list tenant deploy requests: ${error.message}`)
      } else {
        this.error(`Failed to list tenant deploy requests: ${String(error)}`)
      }
    }
  }
}
