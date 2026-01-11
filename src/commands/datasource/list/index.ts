import {Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Datasource} from '../../../lib/types.js'

export default class DatasourceList extends BaseCommand {
  static override description = 'List all datasources in a workspace'

  static override examples = [
    `$ xano datasource list -w 40
Available datasources:
  - default
  - analytics
`,
    `$ xano datasource list -w 40 -o json
[
  {
    "label": "default",
    "color": "#3498db"
  }
]
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
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
    const {flags} = await this.parse(DatasourceList)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const items = await client.listDatasources(workspaceId) as Datasource[]

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
      } else {
        if (items.length === 0) {
          this.log('No datasources found')
        } else {
          this.log('Available datasources:')
          for (const item of items) {
            const color = item.color ? ` [${item.color}]` : ''
            this.log(`  - ${item.label}${color}`)
          }
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
