import {Args, Flags} from '@oclif/core'

import type {SessionDetail} from '../../../../lib/run-types.js'

import BaseRunCommand from '../../../../lib/base-run-command.js'

export default class RunSessionsGet extends BaseRunCommand {
  static args = {
    sessionId: Args.string({
      description: 'Session ID',
      required: true,
    }),
  }
static description = 'Get session details'
static examples = [
    `$ xano run sessions get abc123-def456
Session Details:
  ID:        abc123-def456
  Name:      My Session
  Status:    running
  Access:    private
  URL:       https://session.xano.io/abc123
  Uptime:    3600s
`,
    `$ xano run sessions get abc123-def456 -o json
{ "id": "abc123-def456", "name": "My Session", "status": "running", ... }
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
    const {args, flags} = await this.parse(RunSessionsGet)

    // Initialize (no project required for session details)
    await this.initRunCommand(flags.profile, flags.verbose)

    try {
      const url = this.httpClient.buildSessionUrl(args.sessionId)
      const session = await this.httpClient.get<SessionDetail>(url)

      if (flags.output === 'json') {
        this.outputJson(session)
      } else {
        this.log('Session Details:')
        this.log(`  ID:        ${session.id}`)
        this.log(`  Name:      ${session.name}`)
        this.log(`  Status:    ${session.status}`)
        this.log(`  Access:    ${session.access}`)
        if (session.url) {
          this.log(`  URL:       ${session.url}`)
        }

        if (session.uptime !== null) {
          this.log(`  Uptime:    ${session.uptime}s`)
        }

        this.log(`  Created:   ${session.createdAt}`)
        if (session.projectId) {
          this.log(`  Project:   ${session.projectId}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get session: ${error.message}`)
      } else {
        this.error(`Failed to get session: ${String(error)}`)
      }
    }
  }
}
