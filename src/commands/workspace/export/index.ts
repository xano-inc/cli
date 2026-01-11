import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class WorkspaceExport extends BaseCommand {
  static override description = 'Export complete workspace data and configuration as an archive'

  static override examples = [
    `$ xano workspace export 40 --file workspace-backup.xano
Workspace exported to workspace-backup.xano
`,
    `$ xano workspace export 40
Workspace exported to workspace-40-<timestamp>.xano
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
    file: Flags.string({
      char: 'f',
      description: 'Output file path to save export (default: workspace-<id>-<timestamp>.xano)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WorkspaceExport)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = args.workspace_id || client.getWorkspaceId()

      // Export returns a binary archive file
      const result = await client.exportWorkspace(workspaceId)

      const outputFile = flags.file || `workspace-${workspaceId}-${Date.now()}.xano`
      fs.writeFileSync(outputFile, result.data)
      this.log(`Workspace exported to ${outputFile}`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
