import {Args, Flags} from '@oclif/core'
import * as inquirer from 'inquirer'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {ApiGroup} from '../../../lib/types.js'

export default class ApiGroupDelete extends BaseCommand {
  static override description = 'Delete an API group and all its endpoints permanently'

  static override examples = [
    `$ xano apigroup delete 123 -w 40
Are you sure you want to delete API group 'user' (ID: 123) and all its endpoints? This cannot be undone. (y/N) y
API group deleted successfully!
`,
    `$ xano apigroup delete 123 -w 40 --force
API group deleted successfully!
`,
  ]

  static override args = {
    apigroup_id: Args.string({
      description: 'API Group ID',
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
    const {args, flags} = await this.parse(ApiGroupDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Get API group info for confirmation
      const apiGroup = await client.getApiGroup(workspaceId, args.apigroup_id) as ApiGroup

      if (!flags.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete API group '${apiGroup.name}' (ID: ${apiGroup.id}) and all its endpoints? This cannot be undone.`,
            default: false,
          },
        ])

        if (!confirm) {
          this.log('Delete cancelled.')
          return
        }
      }

      await client.deleteApiGroup(workspaceId, args.apigroup_id)
      this.log('API group deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
