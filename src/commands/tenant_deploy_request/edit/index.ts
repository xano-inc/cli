import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {parseReviewerIds, requestApprovalReview} from '../../../utils/approval-request.js'

interface ApprovalRequest {
  description?: string
  id: number
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
  static description =
    "Edit a tenant deploy request's title or description, and/or ask users to review it. The author or an existing reviewer may do this."
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
      description: 'Comma-separated user IDs to ask to review (added; there is no reviewer list to replace)',
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

    const reviewerIds = parseReviewerIds(flags.reviewers, (message) => this.error(message))
    const wantsEdit = flags.title !== undefined || flags.description !== undefined
    const wantsReviewers = reviewerIds.length > 0

    if (!wantsEdit && !wantsReviewers) {
      this.error('Nothing to edit. Pass --title, --description and/or --reviewers.')
    }

    const baseUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/approval_request/${args.id}`

    // GET first (read-only): it preserves the untouched field on a title/description
    // edit (the PUT requires a title and resets description to '' if omitted), gives
    // the object to display, and fails cleanly if the id is wrong before we ask anyone.
    let item: ApprovalRequest
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

      item = (await getResponse.json()) as ApprovalRequest

      if (wantsEdit) {
        // The PUT route accepts only title/description — reviewer_ids there is
        // dropped, and there is no reviewer list on the request to read back
        // (DEV-8757), so reviewers are asked separately below.
        const body: Record<string, unknown> = {
          description: flags.description === undefined ? (item.description ?? '') : flags.description,
          title: flags.title === undefined ? item.title : flags.title,
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

        item = (await putResponse.json()) as ApprovalRequest
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Failed to edit tenant deploy request: ${message}`)
    }

    // Ask the named reviewers (add-only: review is open to anyone with deploy
    // permission, so there is no list to replace — passing --reviewers adds a nudge).
    let asked: number | undefined
    if (wantsReviewers) {
      try {
        const rows = await requestApprovalReview(
          {
            parseApiError: (...a) => this.parseApiError(...a),
            verboseFetch: (...a) => this.verboseFetch(...a),
          },
          profile,
          {approvalId: args.id, targets: reviewerIds, verbose: flags.verbose, workspaceId},
        )
        asked = rows.length
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const prefix = wantsEdit
          ? `Edited deploy request #${args.id}, but failed to ask reviewers`
          : `Failed to ask reviewers on deploy request #${args.id}`
        this.error(`${prefix}: ${message}`)
      }
    }

    if (flags.output === 'json') {
      this.log(JSON.stringify(item, null, 2))
    } else {
      if (wantsEdit) this.log(`Updated deploy request #${item.id}: "${item.title}" [${item.status}]`)
      if (asked !== undefined) this.log(`Asked ${asked} user(s) to review deploy request #${item.id}.`)
    }
  }
}
