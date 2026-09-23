import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface ApprovalRequest {
  id: number
  status: string
  title: string
}

export default class TenantDeployRequestRevision extends BaseCommand {
  static override args = {
    id: Args.integer({
      description: 'Tenant deploy request ID',
      required: true,
    }),
  }
  static description =
    'Link a newer release candidate to an existing tenant deploy request after changes were requested. The previous candidate is kept in the revision history and the request returns to pending. Author only.'
  static examples = [
    `$ xano tenant_deploy_request revision 12 --release v1.2.1 --note "Added the missing migration"
Deploy request #12 is now: pending
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    note: Flags.string({
      description: 'Note describing what changed in this revision',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    release: Flags.string({
      char: 'r',
      description: 'Name of the new release to review',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantDeployRequestRevision)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const body: Record<string, unknown> = {
      note: flags.note ?? '',
      release_name: flags.release,
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/approval_request/${args.id}/revision`

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
        const message = await this.parseApiError(response, 'Failed to add revision to tenant deploy request')
        this.error(message)
      }

      const item = (await response.json()) as ApprovalRequest

      if (flags.output === 'json') {
        this.log(JSON.stringify(item, null, 2))
      } else {
        this.log(`Deploy request #${item.id} is now: ${item.status}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to add revision to tenant deploy request: ${error.message}`)
      } else {
        this.error(`Failed to add revision to tenant deploy request: ${String(error)}`)
      }
    }
  }
}
