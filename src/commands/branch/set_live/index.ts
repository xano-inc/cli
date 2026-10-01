import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {
  BLANK_POLICY_OVERRIDE,
  blankPolicyOverride,
  gateOverrideHint,
  gateRefusal,
  type GateRefused,
  liveGateLines,
  quoted,
  weakeningRefusal,
  type WeakeningRefused,
} from '../../../utils/policy/gate.js'
import {policyWeakeningGuidance} from '../../../utils/policy/permission.js'

interface Branch {
  backup: boolean
  created_at: string
  label: string
  live: boolean
}

export default class BranchSetLive extends BaseCommand {
  static override args = {
    branch_label: Args.string({
      description: 'Branch label to set as live (use "v1" for default branch)',
      required: true,
    }),
  }
static description =
    '[IMPORTANT] ALWAYS confirm with the user before changing the live branch. Sets a branch as the live (active) branch for API requests. The set-live policy gate checks the branch against its own policies, which live will have once it is set live: when blocking findings refuse it, the command exits 2 unless --policy-override gives a reason. A branch that weakens a mandatory policy of the live branch needs workspace:policy update; without it the command exits 1.'
static examples = [
    `$ xano branch set-live staging
Are you sure you want to set 'staging' as the live branch? (y/N) y
Branch 'staging' is now live
`,
    `$ xano branch set-live v1 --force
Branch 'v1' is now live
`,
    `$ xano branch set-live production -f -o json
{
  "created_at": "2024-02-10T09:15:00Z",
  "label": "production",
  "backup": false,
  "live": true
}
`,
    `$ xano branch set_live rollback --force --policy-override "Rollback approved; finding tracked in JIRA-12"`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
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
    'policy-override': Flags.string({description: 'Set the branch live past a blocking set-live policy gate with an audited reason (requires workspace:policy update)'}),
    workspace: Flags.integer({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }
  /** Set once the platform refuses for a weakened mandatory policy: already explained, it exits 1 as it is. */
  private refusedByPermission = false
  /** Set once the set-live policy gate refuses, the one failure that exits 2. */
  private refusedByPolicyGate = false

  /** Exit 2 is the set-live gate's refusal; every other failure, flag errors included, exits 1. */
  protected override async catch(error: Error & {oclif?: {exit?: number}}): Promise<void> {
    if (this.refusedByPolicyGate) return super.catch(error)
    return this.catchAsOperational(error)
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BranchSetLive)
    if (blankPolicyOverride(flags['policy-override'])) this.error(BLANK_POLICY_OVERRIDE)

    const {profile} = this.resolveProfile(flags)

    // Get workspace ID from flag or profile
    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Either use --workspace flag or set one in your profile.\n' +
        'Usage: xano branch set-live <branch_label> [--workspace <workspace_id>]',
      )
    }

    const branchLabel = args.branch_label

    // Confirmation prompt unless --force is used
    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to set '${branchLabel}' as the live branch?`
      )
      if (!confirmed) {
        this.log('Operation cancelled.')
        return
      }
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/branch/${encodeURIComponent(branchLabel)}/live`

    // A reason from someone with workspace:policy update sets the branch live past a blocking gate.
    const overrideReason = flags['policy-override']?.trim()

    // Set branch as live via the API
    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          ...(overrideReason ? {body: JSON.stringify({override_reason: overrideReason})} : {}),
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            ...(overrideReason ? {'Content-Type': 'application/json'} : {}),
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const refused = await gateRefusal(response)
        if (refused) this.refuseSetLive(refused, flags, branchLabel)
        const weakening = await weakeningRefusal(response)
        if (weakening) this.refuseWeakening(weakening, flags, branchLabel)
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const branch = await response.json() as Branch

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(branch, null, 2))
      } else {
        this.log(`Branch '${branch.label}' is now live`)
      }
    } catch (error) {
      if (this.refusedByPolicyGate || this.refusedByPermission) throw error
      if (error instanceof Error) {
        this.error(`Failed to set branch as live: ${error.message}`)
      } else {
        this.error(`Failed to set branch as live: ${String(error)}`)
      }
    }
  }

  private async confirm(message: string): Promise<boolean> {
    // Use readline for simple yes/no confirmation
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

  /**
   * The set-live gate refused: the verdict on stdout (under `-o json`, `{set_live: false, message,
   * policy_gate}`), then the platform's message and how to proceed, exiting 2.
   */
  private refuseSetLive(refused: GateRefused, flags: {output: string; workspace?: number}, branchLabel: string): never {
    if (flags.output === 'json') {
      this.log(JSON.stringify({message: refused.message, policy_gate: refused.answer, set_live: false}, null, 2))
    } else {
      for (const line of liveGateLines(refused.answer, 'branch')) this.log(line)
    }

    const workspace = flags.workspace ? ` -w ${flags.workspace}` : ''
    const hint = gateOverrideHint(refused.answer, `xano branch set_live ${quoted(branchLabel)}${workspace} --policy-override "<why>"`)
    this.refusedByPolicyGate = true
    this.error(`${refused.message}${hint}`, {exit: 2})
  }

  /**
   * The branch weakens a mandatory policy of the live branch (or lacks one), and the credential lacks
   * `workspace:policy` update. That is a permission refusal, not a blocking finding: it exits 1 (under
   * `-o json` as `{error}`) with the platform's sentence and how to go on. The live branch is unchanged.
   */
  private refuseWeakening(refused: WeakeningRefused, flags: {workspace?: number}, branchLabel: string): never {
    const workspace = flags.workspace ? ` -w ${flags.workspace}` : ''
    this.refusedByPermission = true
    const again = `xano branch set_live ${quoted(branchLabel)}${workspace}`
    const way = refused.payload.unavailable === true
      ? `The check may read them next time: ${again}`
      : `To set it live yourself, give ${quoted(branchLabel)} the live branch's version of those policies, then run: ${again}`
    this.error(`${refused.message}${policyWeakeningGuidance(refused.payload, [way], true)}`)
  }
}
