import {Args, Flags} from '@oclif/core'

import type {Session} from '../../../../lib/run-types.js'

import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunSessionsStop extends BaseRunCommand {
  static args = {
    sessionId: Args.string({
      description: 'Session ID',
      required: true,
    }),
  }
static description = 'Stop a session'
static examples = [
    `$ xano run sessions stop abc123-def456
Session stopped successfully!
  ID:    abc123-def456
  State: stopped
`,
    `$ xano run sessions stop abc123-def456 -o json
{ "id": "abc123-def456", "state": "stopped", ... }
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
    const {args, flags} = await this.parse(RunSessionsStop)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile, flags.verbose)

    try {
      const url = this.httpClient.buildProjectUrl(`/run/session/${args.sessionId}/stop`)
      const session = await this.httpClient.post<Session>(url, {})

      if (flags.output === 'json') {
        this.outputJson(session)
      } else {
        this.log('Session stopped successfully!')
        this.log(`  ID:    ${session.id}`)
        this.log(`  State: ${session.state}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to stop session: ${error.message}`)
      } else {
        this.error(`Failed to stop session: ${String(error)}`)
      }
    }
  }
}
