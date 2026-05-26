import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Workspace {
  created_at?: string
  id: number
  name: string
  // Add other workspace properties as needed
}

interface WorkspaceListResponse {
  workspaces?: Workspace[]
  // Handle both array and object responses
}

export default class WorkspaceList extends BaseCommand {
  static description = 'List all workspaces from the Xano Metadata API'
  static examples = [
    `$ xano workspace:list
Available workspaces:
  - workspace-1 (ID: 1)
  - workspace-2 (ID: 2)
  - workspace-3 (ID: 3)
`,
    `$ xano workspace:list --profile production
Available workspaces:
  - my-app (ID: 1)
  - staging-env (ID: 2)
`,
    `$ xano workspace:list --output json
{
  "workspaces": [
    {
      "id": 1,
      "name": "workspace-1"
    },
    {
      "id": 2,
      "name": "workspace-2"
    }
  ]
}
`,
    `$ xano workspace:list -p staging -o json
{
  "workspaces": [
    {
      "id": 1,
      "name": "my-app"
    }
  ]
}
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    latest: Flags.boolean({
      default: false,
      description: 'Sort by newest first (descending ID)',
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(WorkspaceList)

    const {profile} = this.resolveProfile(flags)

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace`

    // Fetch workspaces from the API
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

      const data = (await response.json()) as Workspace[] | WorkspaceListResponse

      // Handle different response formats
      let workspaces: Workspace[]

      if (Array.isArray(data)) {
        workspaces = data
      } else if (data && typeof data === 'object' && 'workspaces' in data && Array.isArray(data.workspaces)) {
        workspaces = data.workspaces
      } else {
        this.error('Unexpected API response format')
      }

      if (flags.latest) {
        workspaces.sort((a, b) => b.id - a.id)
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(workspaces, null, 2))
      } else {
        // summary format
        if (workspaces.length === 0) {
          this.log('No workspaces found')
        } else {
          this.log('Available workspaces:')
          for (const workspace of workspaces) {
            const created = workspace.created_at ? ` (created: ${workspace.created_at.split(' ')[0]})` : ''
            if (workspace.id === undefined) {
              this.log(`  - ${workspace.name}${created}`)
            } else {
              this.log(`  - ${workspace.name} (ID: ${workspace.id})${created}`)
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch workspaces: ${error.message}`)
      } else {
        this.error(`Failed to fetch workspaces: ${String(error)}`)
      }
    }
  }
}
