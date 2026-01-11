import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class WorkspaceExportSchema extends BaseCommand {
  static override description = 'Export database table schemas and branch configuration'

  static override examples = [
    `$ xano workspace export-schema 40 --file schema-backup.xano
Schema exported to schema-backup.xano
`,
    `$ xano workspace export-schema 40
Schema exported to schema-40-<timestamp>.xano
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
      description: 'Output file path to save schema export (default: schema-<id>-<timestamp>.xano)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WorkspaceExportSchema)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = args.workspace_id || client.getWorkspaceId()

      // Export-schema returns a binary archive file
      const result = await client.exportWorkspaceSchema(workspaceId)

      const outputFile = flags.file || `schema-${workspaceId}-${Date.now()}.xano`
      fs.writeFileSync(outputFile, result.data)
      this.log(`Schema exported to ${outputFile}`)
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
