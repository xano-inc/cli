import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Branch {
  backup: boolean
  created_at: string
  label: string
  live: boolean
}

export default class BranchGet extends BaseCommand {
  static override args = {
    branch_label: Args.string({
      description: 'Branch label (e.g., "v1", "dev")',
      required: true,
    }),
  }
static description = 'Get details for a specific branch'
static examples = [
    `$ xano branch get v1
Branch: v1 (live)
  Created: 2024-01-15
`,
    `$ xano branch get dev -w 123
Branch: dev
  Created: 2024-02-01
`,
    `$ xano branch get staging --output json
{
  "created_at": "2024-02-10T09:15:00Z",
  "label": "staging",
  "backup": false,
  "live": false
}
`,
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
    workspace: Flags.integer({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BranchGet)

    const {profile} = this.resolveProfile(flags)

    // Get workspace ID from flag or profile
    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Either use --workspace flag or set one in your profile.\n' +
        'Usage: xano branch get <branch_label> --workspace <workspace_id>',
      )
    }

    const branchLabel = args.branch_label

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/branch/${encodeURIComponent(branchLabel)}`

    // Fetch branch from the API
    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
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
        // summary format
        const liveIndicator = branch.live ? ' (live)' : ''
        const backupIndicator = branch.backup ? ' (backup)' : ''
        this.log(`Branch: ${branch.label}${liveIndicator}${backupIndicator}`)
        if (branch.created_at) {
          const createdDate = branch.created_at.split('T')[0]
          this.log(`  Created: ${createdDate}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch branch: ${error.message}`)
      } else {
        this.error(`Failed to fetch branch: ${String(error)}`)
      }
    }
  }
}
