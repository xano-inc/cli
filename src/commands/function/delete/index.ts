import {Args, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Function} from '../../../lib/types.js'

export default class FunctionDelete extends BaseCommand {
  static override description = 'Delete a function permanently'

  static override examples = [
    `$ xano function delete 123 -w 40
Are you sure you want to delete function 'my_function' (ID: 123)? This cannot be undone. (y/N) y
Function deleted successfully!
`,
    `$ xano function delete 123 -w 40 --force
Function deleted successfully!
`,
  ]

  static override args = {
    function_id: Args.string({
      description: 'Function ID',
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
    const {args, flags} = await this.parse(FunctionDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Get function info for confirmation
      const func = await client.getFunction(workspaceId, args.function_id) as Function

      if (!flags.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete function '${func.name}' (ID: ${func.id})? This cannot be undone.`,
            default: false,
          },
        ])

        if (!confirm) {
          this.log('Delete cancelled.')
          return
        }
      }

      await client.deleteFunction(workspaceId, args.function_id)
      this.log('Function deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
