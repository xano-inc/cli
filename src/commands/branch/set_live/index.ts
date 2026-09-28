import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {findingLine} from '../../../utils/policy/findings.js'
import {gateOverrideHint, gateRefusal, type GateRefused, type PolicyGateAnswer, quoted} from '../../../utils/policy/gate.js'

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
    '[IMPORTANT] ALWAYS confirm with the user before changing the live branch. Sets a branch as the live (active) branch for API requests. The set-live policy gate checks the branch against the live branch\'s policies: when blocking findings refuse it, the command exits 2 unless --policy-override gives a reason.'
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
  /** Set once the set-live policy gate refuses, the one failure that exits 2. */
  private refusedByPolicyGate = false

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BranchSetLive)

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
      if (this.refusedByPolicyGate) throw error
      // Exit 1, so a policy refusal (exit 2) can be told apart from any other failure.
      if (error instanceof Error) {
        this.error(`Failed to set branch as live: ${error.message}`, {exit: 1})
      } else {
        this.error(`Failed to set branch as live: ${String(error)}`, {exit: 1})
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
      for (const line of setLiveGateLines(refused.answer)) this.log(line)
    }

    const workspace = flags.workspace ? ` -w ${flags.workspace}` : ''
    const hint = gateOverrideHint(refused.answer, `xano branch set_live ${quoted(branchLabel)}${workspace} --policy-override "<why>"`)
    this.refusedByPolicyGate = true
    this.error(`${refused.message}${hint}`, {exit: 2})
  }
}

/** The set-live verdict: its status, what blocks, and the first blocking findings. */
function setLiveGateLines(answer: PolicyGateAnswer): string[] {
  const lines = [`Policy gate: ${answer.status?.trim() || 'unknown'}`]
  if (typeof answer.total === 'number') {
    lines.push(`  Blocking findings: ${answer.total} (${answer.introduced ?? 0} introduced, ${answer.changed ?? 0} on objects the branch changes); ${answer.existing ?? 0} already on the live branch never block`)
  }

  const findings = answer.findings ?? []
  if (findings.length > 0) {
    lines.push(...findings.map(finding => `  ${findingLine(finding, new Map())}`))
    if (answer.truncated) lines.push('  Only the first findings are listed.')
  } else if (answer.findings === undefined && (answer.total ?? 0) > 0) {
    lines.push('  The findings are listed only for a credential that reads policies (workspace:policy read).')
  }

  return lines
}
