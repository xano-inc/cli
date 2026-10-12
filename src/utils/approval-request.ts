import type {ProfileConfig} from '../base-command.js'

/**
 * What {@link requestApprovalReview} needs from the command making the call —
 * the two BaseCommand helpers, passed as plain functions so a protected method
 * can satisfy this public shape (see how the policy utils are wired).
 */
export interface ReviewRequestHost {
  parseApiError(response: Response, fallbackPrefix: string): Promise<string>
  verboseFetch(url: string, options: RequestInit, verbose: boolean, authToken?: string): Promise<Response>
}

/**
 * One `type: "review_request"` activity row written by a review request. The
 * backend drops self-targets, so the returned list can be shorter than the
 * `targets` sent (and empty when the only target was the caller).
 */
export interface ReviewRequestActivity {
  id: number
  target?: {id: number}
}

/**
 * Parse a `--reviewers` flag ("12,45,67") into positive integer user IDs,
 * calling `fail` with a clear message on any non-numeric or non-positive token.
 *
 * Returns `[]` when the flag is absent or empty. Validating here keeps a bad id
 * from being silently coerced to `null` in the JSON `targets` array and from
 * reaching the API as a confusing backend error.
 */
export function parseReviewerIds(raw: string | undefined, fail: (message: string) => never): number[] {
  if (!raw) return []
  return raw.split(',').map((token) => {
    const trimmed = token.trim()
    if (!/^\d+$/.test(trimmed) || Number.parseInt(trimmed, 10) <= 0) {
      fail(`Invalid --reviewers value "${trimmed}": expected a positive numeric user ID.`)
    }

    return Number.parseInt(trimmed, 10)
  })
}

/**
 * Ask specific users to review an approval request via the
 * `.../approval_request/{id}/review_request` route (POST `{targets}`).
 *
 * This is the ONLY call that asks reviewers: the create/edit routes declare no
 * reviewer list and silently drop `reviewer_ids`, so passing reviewer IDs there
 * is a no-op (DEV-8757). The backend writes one `review_request` activity row
 * per target (excluding the caller) and requires at least one target.
 *
 * Throws an `Error` carrying the platform's message on failure, so the caller
 * can report that the request itself was created/edited but asking failed.
 */
export async function requestApprovalReview(
  host: ReviewRequestHost,
  profile: ProfileConfig,
  opts: {approvalId: number; targets: number[]; verbose: boolean; workspaceId: string},
): Promise<ReviewRequestActivity[]> {
  const {approvalId, targets, verbose, workspaceId} = opts
  const url = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/approval_request/${approvalId}/review_request`

  const response = await host.verboseFetch(
    url,
    {
      body: JSON.stringify({targets}),
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${profile.access_token}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
    verbose,
    profile.access_token,
  )

  if (!response.ok) {
    const message = await host.parseApiError(response, 'Failed to request review')
    throw new Error(message)
  }

  return (await response.json()) as ReviewRequestActivity[]
}
