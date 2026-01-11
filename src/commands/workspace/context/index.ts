import {Args} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class WorkspaceContext extends BaseCommand {
  static override description = 'Get full context for a workspace (tables, APIs, functions, etc.)'

  static override examples = [
    `$ xano workspace context 40
# Returns full workspace context in text format
`,
    `$ xano workspace context 40 > context.txt
# Save context to file
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
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WorkspaceContext)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = args.workspace_id || client.getWorkspaceId()

      // Context endpoint returns text format (XanoScript-like)
      const context = await client.getWorkspaceContext(workspaceId)
      this.log(context)
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
