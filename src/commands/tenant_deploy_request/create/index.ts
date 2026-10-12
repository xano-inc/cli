import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {parseReviewerIds, requestApprovalReview} from '../../../utils/approval-request.js'

interface ApprovalRequest {
  id: number
  status: string
  title: string
}

export default class TenantDeployRequestCreate extends BaseCommand {
  static override args = {
    title: Args.string({
      description: 'Short title for the deploy request',
      required: true,
    }),
  }
  static description =
    'Open a tenant deploy request asking named reviewers to approve deploying a release to a tenant. Submits for review immediately unless --draft is passed.'
  static examples = [
    `$ xano tenant_deploy_request create "Deploy v1.2 to prod" --tenant prod --release v1.2 --reviewers 12,45
Created deploy request #12: "Deploy v1.2 to prod" [pending]
`,
    `$ xano tenant_deploy_request create "Deploy v1.2 to prod" --tenant prod --release v1.2 --draft`,
    `$ xano tenant_deploy_request create "$PR_TITLE" --tenant prod --release v1.2 --description "$PR_BODY" --reviewers 12,45 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'Longer description of what is being deployed and why',
      required: false,
    }),
    draft: Flags.boolean({
      default: false,
      description: 'Save as a draft instead of submitting immediately (reviewers are not notified until submitted)',
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
      description: 'Name of the release to deploy',
      required: true,
    }),
    reviewers: Flags.string({
      description: 'Comma-separated user IDs to ask to review (a notification; anyone with deploy permission may review regardless)',
      required: false,
    }),
    tenant: Flags.string({
      char: 't',
      description: 'Name of the target tenant',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantDeployRequestCreate)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    // Validate up front, before creating anything, so a bad id fails fast.
    const reviewerIds = parseReviewerIds(flags.reviewers, (message) => this.error(message))

    // The create route declares no reviewer list and silently drops reviewer_ids;
    // reviewers are asked below via the review_request route (DEV-8757).
    const body: Record<string, unknown> = {
      release_name: flags.release,
      status: flags.draft ? 'draft' : 'pending',
      tenant_name: flags.tenant,
      title: args.title,
    }
    if (flags.description) body.description = flags.description

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/approval_request`

    let item: ApprovalRequest
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
        const message = await this.parseApiError(response, 'Failed to create tenant deploy request')
        this.error(message)
      }

      item = (await response.json()) as ApprovalRequest
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.error(`Failed to create tenant deploy request: ${message}`)
    }

    // Ask the named reviewers — but only for a submitted request. A draft is
    // "not notified until submitted", and asking IS the notification, so a draft
    // never asks (nor is there anywhere to persist the intent for submit-time).
    if (reviewerIds.length > 0) {
      if (flags.draft) {
        this.warn(
          `Draft deploy request #${item.id} saved without asking reviewers; ` +
            `ask them with \`xano tenant_deploy_request edit ${item.id} --reviewers ${flags.reviewers}\` after submitting.`,
        )
      } else {
        try {
          await requestApprovalReview(
            {
              parseApiError: (...a) => this.parseApiError(...a),
              verboseFetch: (...a) => this.verboseFetch(...a),
            },
            profile,
            {approvalId: item.id, targets: reviewerIds, verbose: flags.verbose, workspaceId},
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.error(`Created deploy request #${item.id}, but failed to ask reviewers: ${message}`)
        }
      }
    }

    if (flags.output === 'json') {
      this.log(JSON.stringify(item, null, 2))
    } else {
      this.log(`Created deploy request #${item.id}: "${item.title}" [${item.status}]`)
    }
  }
}
