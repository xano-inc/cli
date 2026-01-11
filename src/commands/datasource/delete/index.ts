import {Args, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class DatasourceDelete extends BaseCommand {
  static override description = 'Delete a datasource'

  static override examples = [
    `$ xano datasource delete analytics -w 40
Are you sure you want to delete datasource 'analytics'? (y/N) y
Datasource deleted successfully!
`,
    `$ xano datasource delete analytics -w 40 --force
Datasource deleted successfully!
`,
  ]

  static override args = {
    label: Args.string({
      description: 'Datasource label',
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
    const {args, flags} = await this.parse(DatasourceDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!flags.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete datasource '${args.label}'? This cannot be undone.`,
            default: false,
          },
        ])

        if (!confirm) {
          this.log('Delete cancelled.')
          return
        }
      }

      await client.deleteDatasource(workspaceId, args.label)
      this.log('Datasource deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
