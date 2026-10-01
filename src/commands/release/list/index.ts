import {Flags} from '@oclif/core'

import BaseCommand, {type ProfileConfig} from '../../../base-command.js'
import {buildPagingJson} from '../../../utils/paging.js'
import {readReleasePolicyChecks, type ReleasePolicyCheck, releasePolicyCheckTag} from '../../../utils/policy/release.js'

interface Release {
  branch?: string
  created_at?: number
  description?: string
  hotfix?: boolean
  id: number
  name: string
  resource_size?: number
}

/** The stored checks by release id, or `null` when they could not be read (see `readReleasePolicyChecks`). */
type ReleaseChecks = Map<number, ReleasePolicyCheck> | null

export default class ReleaseList extends BaseCommand {
  static description =
    "List all releases in a workspace, each with its stored policy check when the credential can read policies (the release's own check, as Studio's Policies column shows it)"
  static examples = [
    `$ xano release list
Releases in workspace 5:
  - v1.0 (ID: 10) - main
  - v1.1-hotfix (ID: 11) - main [hotfix]
`,
    `$ xano release list
Releases in workspace 5:
  - v1.2 (ID: 12) - main (9/28/2026, 4:12:03 PM PDT) [policies: 2 blocking, 1 advisory]
  - v1.1-hotfix (ID: 11) - main [hotfix] (9/27/2026, 9:40:15 AM PDT) [policies: passed]
  - v1.0 (ID: 10) - main (9/20/2026, 1:05:44 PM PDT) [policies: not checked]
Policy check details: xano policy runs --release <name>
`,
    `$ xano release list -w 5 --output json`,
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
    const {flags} = await this.parse(ReleaseList)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release`

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
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const data = (await response.json()) as Release[] | {items?: Release[]}

      let releases: Release[]
      if (Array.isArray(data)) {
        releases = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        releases = data.items
      } else {
        this.error('Unexpected API response format')
      }

      const checks = await this.policyChecks(profile, String(workspaceId), releases, flags.verbose)

      if (flags.output === 'json') {
        this.log(JSON.stringify(buildPagingJson({items: withPolicyChecks(releases, checks)}, {tier: 'none'}), null, 2))
      } else if (releases.length === 0) {
        this.log('No releases found')
      } else {
        this.log(`Releases in workspace ${workspaceId}:`)
        for (const release of releases) this.log(releaseLine(release, checks))
        if (checks) this.log('Policy check details: xano policy runs --release <name>')
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list releases: ${error.message}`)
      } else {
        this.error(`Failed to list releases: ${String(error)}`)
      }
    }
  }

  /**
   * The releases' stored policy checks, read once for the whole list. The list never fails or
   * changes because of this read: it answers `null` when the checks cannot be read (the Policies
   * feature is off, the credential lacks `workspace:policy` read, or the request failed), and the
   * list then prints as it would without policies.
   */
  private async policyChecks(profile: ProfileConfig, workspace: string, releases: Release[], verbose: boolean): Promise<ReleaseChecks> {
    if (releases.length === 0) return null
    return readReleasePolicyChecks(
      {logToStderr: (message) => this.logToStderr(message), verboseFetch: (...args) => this.verboseFetch(...args)},
      {branch: '', profile, verbose, workspace},
      releases.map(release => release.id),
    )
  }
}

/** A release's summary line, tagged with its stored check when the checks were read. */
function releaseLine(release: Release, checks: ReleaseChecks): string {
  const branch = release.branch ? ` - ${release.branch}` : ''
  const hotfix = release.hotfix ? ' [hotfix]' : ''
  const createdAt = release.created_at
    ? ` (${new Date(release.created_at).toLocaleString(undefined, {timeZoneName: 'short'})})`
    : ''
  const policies = checks ? ` ${releasePolicyCheckTag(checks.get(release.id))}` : ''
  return `  - ${release.name} (ID: ${release.id})${branch}${hotfix}${createdAt}${policies}`
}

/**
 * The releases for `-o json`: each gains `policy_check` (its stored check as the platform lists
 * it, without the release id it is keyed by, or `null` for a release with no stored check) when
 * the checks were read, and stays as served when they could not be, so a reader can tell an
 * unchecked release (`null`) from checks the CLI could not read (absent).
 */
function withPolicyChecks(releases: Release[], checks: ReleaseChecks): Array<Release & {policy_check?: null | Omit<ReleasePolicyCheck, 'release_id'>}> {
  if (!checks) return releases
  return releases.map(release => {
    const check = checks.get(release.id)
    if (!check) return {...release, policy_check: null}
    const stored = {...check}
    delete stored.release_id
    return {...release, policy_check: stored}
  })
}
