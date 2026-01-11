import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Datasource} from '../../../lib/types.js'

export default class DatasourceEdit extends BaseCommand {
  static override description = 'Edit an existing datasource'

  static override examples = [
    `$ xano datasource edit analytics -w 40 --label new_analytics
Datasource updated successfully!
`,
    `$ xano datasource edit analytics -w 40 --color "#e74c3c"
Datasource updated successfully!
`,
  ]

  static override args = {
    label: Args.string({
      description: 'Datasource label (current)',
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
    label: Flags.string({
      char: 'l',
      description: 'New datasource label',
      required: false,
    }),
    color: Flags.string({
      char: 'c',
      description: 'New datasource color (hex format)',
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
    const {args, flags} = await this.parse(DatasourceEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const data: {label?: string; color?: string} = {}

      if (flags.label !== undefined) {
        data.label = flags.label
      }
      if (flags.color !== undefined) {
        data.color = flags.color
      }

      if (Object.keys(data).length === 0) {
        this.error('At least one of --label or --color must be provided')
      }

      const datasource = await client.updateDatasource(workspaceId, args.label, data) as Datasource

      if (flags.output === 'json') {
        this.log(JSON.stringify(datasource, null, 2))
      } else {
        this.log('Datasource updated successfully!')
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
