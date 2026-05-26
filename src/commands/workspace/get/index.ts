import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Workspace {
  created_at?: string
  description?: string
  id: number
  name: string
  preferences?: {allow_push?: boolean}
  updated_at?: string
}

export default class WorkspaceGet extends BaseCommand {
  static description = 'Get details of a specific workspace from the Xano Metadata API'
  static examples = [
    `$ xano workspace get -w 123
Workspace: my-workspace (ID: 123)
  Description: My workspace description
  Created: 2024-01-15
`,
    `$ xano workspace get --output json
{
  "id": 123,
  "name": "my-workspace",
  "description": "My workspace description"
}
`,
    `$ xano workspace get -w 456 -p production -o json
{
  "id": 456,
  "name": "production-workspace"
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(WorkspaceGet)

    const {profile} = this.resolveProfile(flags)

    // Get workspace ID from flag or profile
    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use -w flag or set one in your profile.\n' +
          'Usage: xano workspace get -w <workspace_id>',
      )
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}`

    // Fetch workspace from the API
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

      const workspace = (await response.json()) as Workspace

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(workspace, null, 2))
      } else {
        // summary format
        this.log(`Workspace: ${workspace.name} (ID: ${workspace.id})`)
        if (workspace.description) {
          this.log(`  Description: ${workspace.description}`)
        }

        if (workspace.created_at) {
          const createdDate = new Date(workspace.created_at).toISOString().split('T')[0]
          this.log(`  Created: ${createdDate}`)
        }

        if (workspace.updated_at) {
          const updatedDate = new Date(workspace.updated_at).toISOString().split('T')[0]
          this.log(`  Updated: ${updatedDate}`)
        }

        if (workspace.preferences?.allow_push !== undefined) {
          this.log(`  Allow Push: ${workspace.preferences.allow_push}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch workspace: ${error.message}`)
      } else {
        this.error(`Failed to fetch workspace: ${String(error)}`)
      }
    }
  }
}
