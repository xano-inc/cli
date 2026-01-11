import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Addon} from '../../../lib/types.js'

export default class AddonCreate extends BaseCommand {
  static override description = 'Create a new addon from XanoScript file'

  static override examples = [
    `$ xano addon create -w 40 -f addon.xs
Addon created successfully!
ID: 123
Name: my_addon
`,
    `$ xano addon create -w 40 -f addon.xs -o json
{
  "id": 123,
  "name": "my_addon"
}
`,
  ]

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
    const {flags} = await this.parse(AddonCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }

      const xsContent = fs.readFileSync(flags.file, 'utf8')
      const addon = await client.createAddon(workspaceId, xsContent) as Addon

      if (flags.output === 'json') {
        this.log(JSON.stringify(addon, null, 2))
      } else {
        this.log('Addon created successfully!')
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
