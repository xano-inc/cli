import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

export interface Branch {
  backup: boolean
  created_at: string
  label: string
  live: boolean
}

export function filterBackups(branches: Branch[], includeBackups: boolean): Branch[] {
  return includeBackups ? branches : branches.filter((b) => !b.backup)
}

export default class BranchList extends BaseCommand {
  static description = 'List all branches in a workspace'
  static examples = [
    `$ xano branch list
Available branches:
  - v1 (live)
  - dev
  - staging
`,
    `$ xano branch list -w 123
Available branches:
  - v1 (live)
  - feature-auth
`,
    `$ xano branch list --backups
Available branches:
  - v1 (live)
  - dev
  - backup_2024_01_15 (backup)
`,
    `$ xano branch list --output json
[
  {
    "created_at": "2024-01-15T10:30:00Z",
    "label": "v1",
    "backup": false,
    "live": true
  }
]
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    backups: Flags.boolean({
      default: false,
      description: 'Include backup branches in the output',
      required: false,
    }),
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
    const {flags} = await this.parse(BranchList)

    const {profile} = this.resolveProfile(flags)

    // Get workspace ID from flag or profile
    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use -w flag or set one in your profile.\n' +
        'Usage: xano branch list -w <workspace_id>',
      )
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/branch`

    // Fetch branches from the API
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

      const allBranches = await response.json() as Branch[]
      const branches = filterBackups(allBranches, flags.backups)

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(branches, null, 2))
      } else {
        // summary format
        if (branches.length === 0) {
          this.log('No branches found')
        } else {
          this.log('Available branches:')
          for (const branch of branches) {
            const liveIndicator = branch.live ? ' (live)' : ''
            const backupIndicator = branch.backup ? ' (backup)' : ''
            this.log(`  - ${branch.label}${liveIndicator}${backupIndicator}`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch branches: ${error.message}`)
      } else {
        this.error(`Failed to fetch branches: ${String(error)}`)
      }
    }
  }
}
