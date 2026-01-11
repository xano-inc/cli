import {Args, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import BaseCommand from '../../../../base-command.js'
import {XanoApiClient} from '../../../../lib/api-client.js'

interface Build {
  id: number
  name: string
}

export default class StaticHostBuildDelete extends BaseCommand {
  static override description = 'Delete a static host build'

  static override examples = [
    `$ xano static_host build delete default 52 -w 40
Are you sure you want to delete build 52? (y/N) y
Build deleted successfully!
`,
    `$ xano static_host build delete default 52 -w 40 --force
Build deleted successfully!
`,
  ]

  static override args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
    build_id: Args.string({
      description: 'Build ID',
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
    const {args, flags} = await this.parse(StaticHostBuildDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      // Get build info for confirmation
      const build = await client.getStaticHostBuild(workspaceId, args.static_host, args.build_id) as Build

      if (!flags.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete build '${build.name || build.id}' (ID: ${build.id})? This cannot be undone.`,
            default: false,
          },
        ])

        if (!confirm) {
          this.log('Delete cancelled.')
          return
        }
      }

      await client.deleteStaticHostBuild(workspaceId, args.static_host, args.build_id)
      this.log('Build deleted successfully!')
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
