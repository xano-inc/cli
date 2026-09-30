import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {
  BLANK_POLICY_OVERRIDE,
  blankPolicyOverride,
  gateOverrideHint,
  gateRefusal,
  type GateRefused,
  type LiveGateAnswer,
  liveGateLines,
  quoted,
  weakeningRefusal,
  type WeakeningRefused,
} from '../../../utils/policy/gate.js'
import {policyWeakeningGuidance} from '../../../utils/policy/permission.js'

interface Release {
  branch?: string
  created_at?: number | string
  description?: string
  id: number
  name: string
  /** The release's policies the new branch left out (a key another policy holds, a policy that does not validate). */
  policies_skipped?: null | {keys?: string[]; message?: string}
  /** The set-live policy gate's verdict (`pass`, `overridden`, ...) with --set_live, when Policies is enabled. */
  policy_gate?: LiveGateAnswer | null
}

/** A set-live refusal names the branch the release was deployed as, which stays. */
type SetLiveRefusal = LiveGateAnswer & {branch?: {id?: number; label?: string}}

export default class ReleaseDeploy extends BaseCommand {
  static override args = {
    release_name: Args.string({
      description: 'Name of the release to deploy',
      required: true,
    }),
  }
  static description =
    "[IMPORTANT] ALWAYS confirm with the user before deploying a release. Deploys a release to its workspace as a new branch. With --set_live the branch is then set live through the set-live policy gate: when blocking findings refuse it, the branch stays, set live is refused, and the command exits 2 unless --policy-override gives a reason. A release that weakens a mandatory policy of the live branch needs workspace:policy update to be set live; without it the branch stays and the command exits 1."
  static examples = [
    `$ xano release deploy "v1.0"
Are you sure you want to deploy release "v1.0"? (y/N) y
Deployed release "v1.0" to workspace 40 (branch: v1.0, set live)
`,
    `$ xano release deploy "v1.0" --force
Deployed release "v1.0" to workspace 40 (branch: v1.0)
`,
    `$ xano release deploy "v1.0" --branch "restore-v1" --no-set_live`,
    `$ xano release deploy "v1.0" -w 40 -o json --force`,
    `$ xano release deploy "v1.0" --branch "rollback-v1" --set_live --policy-override "Rollback approved; finding tracked in JIRA-12"`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch label for the new branch (defaults to release branch name)',
      required: false,
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: '[IMPORTANT] NEVER run without explicit user confirmation. Skips the confirmation prompt.',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    'policy-override': Flags.string({description: 'With --set_live, set the branch live past a blocking set-live policy gate with an audited reason (requires workspace:policy update)'}),
    set_live: Flags.boolean({
      default: false,
      description: '[CRITICAL] STOP and confirm with the user before setting the deployed branch as live.',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }
  /** Set once the platform refuses set live for a weakened mandatory policy: already explained, it exits 1 as it is. */
  private refusedByPermission = false
  /** Set once the set-live policy gate refuses, the one failure that exits 2. */
  private refusedByPolicyGate = false

  /** Exit 2 is the set-live gate's refusal; every other failure, flag errors included, exits 1. */
  protected override async catch(error: Error & {oclif?: {exit?: number}}): Promise<void> {
    if (this.refusedByPolicyGate) return super.catch(error)
    return this.catchAsOperational(error)
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ReleaseDeploy)
    if (blankPolicyOverride(flags['policy-override'])) this.error(BLANK_POLICY_OVERRIDE)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const releaseName = encodeURIComponent(args.release_name)
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release/${releaseName}/deploy`

    const body = deployBody(flags)
    if (body.override_reason && !flags.set_live) {
      this.error('--policy-override only applies with --set_live: a branch that is not set live is not gated.')
    }

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to deploy release "${args.release_name}" to workspace ${workspaceId}?`
      )
      if (!confirmed) {
        this.log('Deploy cancelled.')
        return
      }
    }

    this.warn('This may take a few minutes. Please be patient.')

    const startTime = Date.now()

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
        await this.refuseIfSetLiveRefused(response, flags, args.release_name)
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const release = (await response.json()) as Release

      if (flags.output === 'json') {
        this.log(JSON.stringify(release, null, 2))
      } else {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        const branchLabel = flags.branch || release.branch || 'default'
        const liveStatus = flags.set_live ? ', set live' : ''
        this.log(`Deployed release "${release.name}" to workspace ${workspaceId} (branch: ${branchLabel}${liveStatus})`)
        if (release.description) this.log(`  Description: ${release.description}`)
        this.logPolicyOutcome(release)
        this.log(`  Time: ${elapsed}s`)
      }

      // A policy of the release the new branch could not take is never dropped silently.
      const skipped = release.policies_skipped?.message
      if (skipped) this.warn(skipped)
    } catch (error) {
      if (this.refusedByPolicyGate || this.refusedByPermission) throw error
      if (error instanceof Error) {
        this.error(`Failed to deploy release: ${error.message}`)
      } else {
        this.error(`Failed to deploy release: ${String(error)}`)
      }
    }
  }

  private async confirm(message: string): Promise<boolean> {
    const readline = await import('node:readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(`${message} (y/N) `, (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      })
    })
  }

  /** The set-live verdict a successful deploy answered with --set_live (`pass`, `overridden`, ...). */
  private logPolicyOutcome(release: Release): void {
    const status = release.policy_gate?.status
    if (status) this.log(`  Policy gate: ${status}`)
  }

  /** Stops the command when set live was refused after the branch was created: by the gate (exit 2) or for a weakened mandatory policy (exit 1). */
  private async refuseIfSetLiveRefused(response: Response, flags: {branch?: string; output: string; workspace?: string}, releaseName: string): Promise<void> {
    const refused = await gateRefusal(response)
    if (refused) this.refuseSetLive(refused, flags, releaseName)
    const weakening = await weakeningRefusal(response)
    if (weakening) this.refuseWeakening(weakening, flags)
  }

  /**
   * The set-live gate refused after the branch was created: the verdict, the refusal, and how to
   * proceed, exiting 2. Under `-o json` the refusal is `{branch_created, set_live, branch, message,
   * policy_gate}`.
   */
  private refuseSetLive(refused: GateRefused, flags: {branch?: string; output: string; workspace?: string}, releaseName: string): never {
    const answer = refused.answer as SetLiveRefusal
    const label = answer.branch?.label || flags.branch || 'the release branch'
    if (flags.output === 'json') {
      this.log(JSON.stringify({branch: answer.branch ?? null, branch_created: true, message: refused.message, policy_gate: answer, set_live: false}, null, 2))
    } else {
      for (const line of liveGateLines(answer, 'release')) this.log(line)
    }

    const workspace = flags.workspace ? ` -w ${quoted(flags.workspace)}` : ''
    const rerun = `xano branch delete ${quoted(label)}${workspace} && xano release deploy ${quoted(releaseName)}${workspace}${flags.branch ? ` --branch ${quoted(flags.branch)}` : ''} --set_live --policy-override "<why>"`
    const hint = gateOverrideHint(answer, rerun)
    this.refusedByPolicyGate = true
    this.error(
      `The branch was created; set live was refused. ${refused.message}${hint}${answer.can_override && !answer.override_denied ? `\nOr set "${label}" live from Studio's Branches panel, which asks for the reason.` : ''}`,
      {exit: 2},
    )
  }

  /**
   * Set live was refused after the branch was created because the release weakens (or lacks) a
   * mandatory policy of the live branch, and the credential lacks `workspace:policy` update. That is a
   * permission refusal, not a blocking finding: it exits 1 (under `-o json` as `{error}`) with the
   * platform's sentence, which names the branch, and how to go on.
   */
  private refuseWeakening(refused: WeakeningRefused, flags: {branch?: string; workspace?: string}): never {
    const label = refused.payload.branch?.label || flags.branch
    const workspace = flags.workspace ? ` -w ${quoted(flags.workspace)}` : ''
    const ways = label
      ? [`The branch stays. To remove it:  xano branch delete ${quoted(label)}${workspace}`, `Someone with that permission can set it live:  xano branch set_live ${quoted(label)}${workspace}`]
      : []
    this.refusedByPermission = true
    this.error(`${refused.message}${policyWeakeningGuidance(refused.payload, ways)}`)
  }
}

/** The deploy request's body: the new branch's label, set_live, and the override reason when one is given. */
function deployBody(flags: {branch?: string; 'policy-override'?: string; set_live: boolean}): Record<string, unknown> {
  const body: Record<string, unknown> = {set_live: flags.set_live}
  if (flags.branch) body.branch = flags.branch
  const overrideReason = flags['policy-override']?.trim()
  if (overrideReason) body.override_reason = overrideReason
  return body
}
