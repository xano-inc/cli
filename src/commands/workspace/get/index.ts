import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Workspace} from '../../../lib/types.js'

export default class WorkspaceGet extends BaseCommand {
  static override description = 'Get detailed information about a workspace'

  static override examples = [
    `$ xano workspace get 40
Workspace: My Workspace (ID: 40)
Created: 2024-01-01 10:00:00
`,
    `$ xano workspace get 40 -o json
{
  "id": 40,
  "name": "My Workspace",
  ...
}
`,
  ]

  static override args = {
    workspace_id: Args.string({
      description: 'Workspace ID (uses profile default if not specified)',
      required: false,
    }),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WorkspaceGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = args.workspace_id || client.getWorkspaceId()

      const workspace = await client.getWorkspace(workspaceId) as Workspace

      if (flags.output === 'json') {
        this.log(JSON.stringify(workspace, null, 2))
      } else {
        this.log(`Workspace: ${workspace.name} (ID: ${workspace.id})`)
        if (workspace.description) {
          this.log(`Description: ${workspace.description}`)
        }
        if (workspace.created_at) {
          this.log(`Created: ${workspace.created_at}`)
        }
        if (workspace.updated_at) {
          this.log(`Updated: ${workspace.updated_at}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
