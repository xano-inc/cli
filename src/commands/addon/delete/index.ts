import {Args, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Addon} from '../../../lib/types.js'

export default class AddonDelete extends BaseCommand {
  static override description = 'Delete an addon'

  static override examples = [
    `$ xano addon delete 123 -w 40
Are you sure you want to delete addon 'redis_cache' (ID: 123)? (y/N) y
Addon deleted successfully!
`,
    `$ xano addon delete 123 -w 40 --force
Addon deleted successfully!
`,
  ]

  static override args = {
    addon_id: Args.string({
      description: 'Addon ID',
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
    const {args, flags} = await this.parse(AddonDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Get addon info for confirmation
      const addon = await client.getAddon(workspaceId, args.addon_id) as Addon

      if (!flags.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete addon '${addon.name}' (ID: ${addon.id})? This cannot be undone.`,
            default: false,
          },
        ])

        if (!confirm) {
          this.log('Delete cancelled.')
          return
        }
      }

      await client.deleteAddon(workspaceId, args.addon_id)
      this.log('Addon deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
