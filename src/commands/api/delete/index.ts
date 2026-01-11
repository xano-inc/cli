import {Args, Flags} from '@oclif/core'
import * as inquirer from 'inquirer'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Api} from '../../../lib/types.js'

export default class ApiDelete extends BaseCommand {
  static override description = 'Delete an API endpoint permanently'

  static override examples = [
    `$ xano api delete 5 123 -w 40
Are you sure you want to delete API 'GET /user' (ID: 123)? This cannot be undone. (y/N) y
API deleted successfully!
`,
    `$ xano api delete 5 123 -w 40 --force
API deleted successfully!
`,
  ]

  static override args = {
    apigroup_id: Args.string({
      description: 'API Group ID',
      required: true,
    }),
    api_id: Args.string({
      description: 'API ID',
      required: true,
    }),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Skip confirmation prompt',
      required: false,
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ApiDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Get API info for confirmation
      const api = await client.getApi(workspaceId, args.apigroup_id, args.api_id) as Api

      if (!flags.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete API '${api.verb} /${api.name}' (ID: ${api.id})? This cannot be undone.`,
            default: false,
          },
        ])

        if (!confirm) {
          this.log('Delete cancelled.')
          return
        }
      }

      await client.deleteApi(workspaceId, args.apigroup_id, args.api_id)
      this.log('API deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
