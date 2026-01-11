import {Args, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Middleware} from '../../../lib/types.js'

export default class MiddlewareDelete extends BaseCommand {
  static override description = 'Delete a middleware'

  static override examples = [
    `$ xano middleware delete 123 -w 40
Are you sure you want to delete middleware 'auth_check' (ID: 123)? (y/N) y
Middleware deleted successfully!
`,
    `$ xano middleware delete 123 -w 40 --force
Middleware deleted successfully!
`,
  ]

  static override args = {
    middleware_id: Args.string({
      description: 'Middleware ID',
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
    const {args, flags} = await this.parse(MiddlewareDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Get middleware info for confirmation
      const middleware = await client.getMiddleware(workspaceId, args.middleware_id) as Middleware

      if (!flags.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete middleware '${middleware.name}' (ID: ${middleware.id})? This cannot be undone.`,
            default: false,
          },
        ])

        if (!confirm) {
          this.log('Delete cancelled.')
          return
        }
      }

      await client.deleteMiddleware(workspaceId, args.middleware_id)
      this.log('Middleware deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
