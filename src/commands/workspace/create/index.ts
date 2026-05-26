import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Workspace {
  created_at?: number
  description?: string
  id: number
  name: string
  updated_at?: number
}

export default class WorkspaceCreate extends BaseCommand {
  static override args = {
    name: Args.string({
      description: 'Name of the workspace',
      required: true,
    }),
  }
  static description = 'Create a new workspace via the Xano Metadata API'
  static examples = [
    `$ xano workspace create my-workspace
Created workspace: my-workspace (ID: 123)
`,
    `$ xano workspace create my-app --description "My application workspace"
Created workspace: my-app (ID: 456)
  Description: My application workspace
`,
    `$ xano workspace create new-project -d "New project workspace" -o json
{
  "id": 789,
  "name": "new-project",
  "description": "New project workspace"
}
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'Description for the workspace',
      required: false,
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
    const {args, flags} = await this.parse(WorkspaceCreate)

    const {profile} = this.resolveProfile(flags)

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace`

    // Build request body
    const body: {description?: string; name: string;} = {
      name: args.name,
    }
    if (flags.description) {
      body.description = flags.description
    }

    // Create workspace via the API
    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
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

      const workspace = await response.json() as Workspace

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(workspace, null, 2))
      } else {
        // summary format
        this.log(`Created workspace: ${workspace.name} (ID: ${workspace.id})`)
        if (workspace.description) {
          this.log(`  Description: ${workspace.description}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create workspace: ${error.message}`)
      } else {
        this.error(`Failed to create workspace: ${String(error)}`)
      }
    }
  }
}
