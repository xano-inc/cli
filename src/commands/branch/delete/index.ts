import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class BranchDelete extends BaseCommand {
  static override description = 'Delete a workspace branch (cannot delete default or live branch)'

  static override examples = [
    `$ xano branch delete dev -w 40
Branch 'dev' deleted successfully!
`,
    `$ xano branch delete feature-branch -w 40 --force
Branch 'feature-branch' deleted successfully!
`,
  ]

  static override args = {
    branch_label: Args.string({
      description: 'Branch label to delete',
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
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BranchDelete)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      await client.deleteBranch(workspaceId, args.branch_label)
      this.log(`Branch '${args.branch_label}' deleted successfully!`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
