import {Args, Flags} from '@oclif/core'

import type {SinkData} from '../../../../lib/run-types.js'

import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunSinkGet extends BaseRunCommand {
  static args = {
    sessionId: Args.string({
      description: 'Session ID',
      required: true,
    }),
  }
static description = 'Get sink data for a completed session'
static examples = [
    `$ xano run sink get abc123-def456
Sink Data:
  Tables: 3
    - users (5 rows)
    - orders (12 rows)
    - products (8 rows)
  Logs: 15 entries
`,
    `$ xano run sink get abc123-def456 -o json
{ "tables": [...], "logs": [...] }
`,
  ]
static override flags = {
    ...BaseRunCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunSinkGet)

    // Initialize (no project required for sink data)
    await this.initRunCommand(flags.profile, flags.verbose)

    try {
      const url = this.httpClient.buildSessionUrl(args.sessionId, '/sink')
      const sinkData = await this.httpClient.get<SinkData>(url)

      if (flags.output === 'json') {
        this.outputJson(sinkData)
      } else {
        this.log('Sink Data:')
        this.log(`  Tables: ${sinkData.tables.length}`)
        for (const table of sinkData.tables) {
          const rowCount = table.content?.length || 0
          this.log(`    - ${table.name} (${rowCount} rows)`)
        }

        this.log(`  Logs: ${sinkData.logs.length} entries`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get sink data: ${error.message}`)
      } else {
        this.error(`Failed to get sink data: ${String(error)}`)
      }
    }
  }
}
