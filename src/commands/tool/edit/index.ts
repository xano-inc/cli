import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class ToolEdit extends BaseCommand {
  static override description = 'Edit an existing tool from XanoScript file'

  static override examples = [
    `$ xano tool edit 123 -w 40 -f tool.xs
Tool updated successfully!
`,
    `$ xano tool edit 123 -w 40 -f tool.xs -o json
{"id": 123, "name": "updated_tool", ...}
`,
  ]

  static override args = {
    tool_id: Args.string({description: 'Tool ID', required: true}),
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
    const {args, flags} = await this.parse(ToolEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }

      const xsContent = fs.readFileSync(flags.file, 'utf8')
      const tool = await client.updateTool(workspaceId, args.tool_id, xsContent) as {id: number; name: string}

      if (flags.output === 'json') {
        this.log(JSON.stringify(tool, null, 2))
      } else {
        this.log('Tool updated successfully!')
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
