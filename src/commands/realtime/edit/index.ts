import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'

export default class RealtimeEdit extends BaseCommand {
  static override description = 'Update realtime configuration for a workspace'

  static override flags = {
    ...BaseCommand.baseFlags,
    workspace: Flags.string({char: 'w', description: 'Workspace ID', required: false}),
    data: Flags.string({char: 'd', description: 'Configuration data as JSON', required: false}),
    file: Flags.string({char: 'f', description: 'Path to JSON file', required: false}),
    output: Flags.string({char: 'o', description: 'Output format', default: 'summary', options: ['summary', 'json']}),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RealtimeEdit)
    try {
      const client = XanoApiClient.fromProfile(flags.profile || XanoApiClient.getDefaultProfile())
      const workspaceId = client.getWorkspaceId(flags.workspace)
      let configData: Record<string, unknown>
      if (flags.file) {
        if (!fs.existsSync(flags.file)) this.error(`File not found: ${flags.file}`)
        configData = JSON.parse(fs.readFileSync(flags.file, 'utf8'))
      } else if (flags.data) {
        configData = JSON.parse(flags.data)
      } else {
        this.error('Either --data or --file must be provided')
      }
      const result = await client.updateRealtime(workspaceId, configData)
      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('Realtime configuration updated successfully!')
      }
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
