import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Datasource} from '../../../lib/types.js'

export default class DatasourceCreate extends BaseCommand {
  static override description = 'Create a new datasource'

  static override examples = [
    `$ xano datasource create -w 40 --label analytics
Datasource created successfully!
Label: analytics
`,
    `$ xano datasource create -w 40 --label analytics --color "#e74c3c"
Datasource created successfully!
Label: analytics
Color: #e74c3c
`,
    `$ xano datasource create -w 40 --label analytics -o json
{
  "label": "analytics",
  "color": "#3498db"
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
    label: Flags.string({
      char: 'l',
      description: 'Datasource label (unique identifier)',
      required: true,
    }),
    color: Flags.string({
      char: 'c',
      description: 'Datasource color (hex format, e.g., "#3498db")',
      required: false,
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
    const {flags} = await this.parse(DatasourceCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const data: {label: string; color?: string} = {
        label: flags.label,
      }

      if (flags.color) {
        data.color = flags.color
      }

      const datasource = await client.createDatasource(workspaceId, data) as Datasource

      if (flags.output === 'json') {
        this.log(JSON.stringify(datasource, null, 2))
      } else {
        this.log('Datasource created successfully!')
        this.log(`Label: ${datasource.label}`)
        if (datasource.color) {
          this.log(`Color: ${datasource.color}`)
        }
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
