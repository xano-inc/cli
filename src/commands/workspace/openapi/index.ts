import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class WorkspaceOpenApi extends BaseCommand {
  static override description = 'Get workspace-wide OpenAPI (Swagger) specification'

  static override examples = [
    `$ xano workspace openapi 40
# Returns OpenAPI spec as JSON
`,
    `$ xano workspace openapi 40 > openapi.json
# Save OpenAPI spec to file
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
      default: 'json',
      options: ['json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WorkspaceOpenApi)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = args.workspace_id || client.getWorkspaceId()

      const openapi = await client.getWorkspaceOpenApi(workspaceId)
      this.log(JSON.stringify(openapi, null, 2))
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
