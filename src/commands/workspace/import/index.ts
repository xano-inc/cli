import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import inquirer from 'inquirer'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class WorkspaceImport extends BaseCommand {
  static override description = 'Replace workspace content and configuration with imported archive'

  static override examples = [
    `$ xano workspace import 40 --file workspace-backup.json
Are you sure you want to import and replace workspace content? (y/N) y
Workspace imported successfully!
`,
    `$ xano workspace import 40 --file backup.json --force
Workspace imported successfully!
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
      description: 'Input file path containing export data',
      required: true,
    }),
    force: Flags.boolean({
      description: 'Skip confirmation prompt',
      required: false,
      default: false,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(WorkspaceImport)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = args.workspace_id || client.getWorkspaceId()

      // Read import file
      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }

      const importData = JSON.parse(fs.readFileSync(flags.file, 'utf8'))

      if (!flags.force) {
        const {confirm} = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to import and replace workspace content? This may overwrite existing data.',
            default: false,
          },
        ])

        if (!confirm) {
          this.log('Import cancelled.')
          return
        }
      }

      const result = await client.importWorkspace(workspaceId, importData)

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('Workspace imported successfully!')
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }
}
