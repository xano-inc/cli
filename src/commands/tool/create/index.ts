import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class ToolCreate extends BaseCommand {
  static override description = 'Create a new tool from XanoScript file'

  static override examples = [
    `$ xano tool create -w 40 -f tool.xs
Tool created successfully!
ID: 123
Name: my_tool
`,
    `$ xano tool create -w 40 -f tool.xs -o json
{
  "id": 123,
  "name": "my_tool"
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
    const {flags} = await this.parse(ToolCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      if (!fs.existsSync(flags.file)) {
        this.error(`File not found: ${flags.file}`)
      }

      const xsContent = fs.readFileSync(flags.file, 'utf8')
      const tool = await client.createTool(workspaceId, xsContent) as {id: number; name: string}

      if (flags.output === 'json') {
        this.log(JSON.stringify(tool, null, 2))
      } else {
        this.log('Tool created successfully!')
        this.log(`ID: ${tool.id}`)
        this.log(`Name: ${tool.name}`)
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
