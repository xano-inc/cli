import {Flags} from '@oclif/core'

import type {PaginatedResponse, Session} from '../../../../lib/run-types.js'

import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunSessionsList extends BaseRunCommand {
  static args = {}
static description = 'List all sessions for the project'
static examples = [
    `$ xano run sessions list
ID                                    STATE      CREATED
abc123-def456-ghi789                  running    2024-01-15T10:30:00Z
xyz789-uvw456-rst123                  stopped    2024-01-14T09:00:00Z
`,
    `$ xano run sessions list -o json
{ "items": [{ "id": "abc123-def456-ghi789", "state": "running", ... }] }
`,
  ]
static override flags = {
    ...BaseRunCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      default: 'table',
      description: 'Output format',
      options: ['table', 'json'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(RunSessionsList)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile, flags.verbose)

    try {
      const url = this.httpClient.buildProjectUrl('/run/session')
      const result = await this.httpClient.get<PaginatedResponse<Session>>(url)

      if (flags.output === 'json') {
        this.outputJson(result)
      } else {
        this.outputTable(result.items)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list sessions: ${error.message}`)
      } else {
        this.error(`Failed to list sessions: ${String(error)}`)
      }
    }
  }

  private outputTable(sessions: Session[]): void {
    if (sessions.length === 0) {
      this.log('No sessions found.')
      return
    }

    // Print header
    this.log('ID                                    STATE      CREATED')
    this.log('-'.repeat(75))

    for (const session of sessions) {
      const id = session.id.padEnd(36)
      const state = session.state.slice(0, 10).padEnd(10)
      const created = session.created_at
      this.log(`${id}  ${state} ${created}`)
    }
  }
}
