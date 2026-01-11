import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Addon} from '../../../lib/types.js'

export default class AddonEdit extends BaseCommand {
  static override description = 'Edit an existing addon using XanoScript file'

  static override examples = [
    `$ xano addon edit 123 -w 40 -f addon.xs
Addon updated successfully!
`,
    `$ xano addon edit 123 -w 40 -f addon.xs -o json
{
  "id": 123,
  "name": "updated_addon"
}
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
    file: Flags.string({
      char: 'f',
      description: 'Path to XanoScript file (required)',
      required: true,
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
    const {args, flags} = await this.parse(AddonEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }

      const xsContent = fs.readFileSync(flags.file, 'utf8')
      const addon = await client.updateAddon(workspaceId, args.addon_id, xsContent) as Addon

      if (flags.output === 'json') {
        this.log(JSON.stringify(addon, null, 2))
      } else {
        this.log('Addon updated successfully!')
        this.log(`ID: ${addon.id}`)
        this.log(`Name: ${addon.name}`)
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
