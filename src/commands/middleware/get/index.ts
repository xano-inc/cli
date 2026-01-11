import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Middleware} from '../../../lib/types.js'

export default class MiddlewareGet extends BaseCommand {
  static override description = 'Get details of a specific middleware'

  static override examples = [
    `$ xano middleware get 123 -w 40
Middleware: auth_check
ID: 123
Description: Authentication check middleware
`,
    `$ xano middleware get 123 -w 40 -o json
{
  "id": 123,
  "name": "auth_check",
  "description": "Authentication check middleware"
}
`,
    `$ xano middleware get 123 -w 40 -o xs
middleware auth_check {
  ...
}
`,
  ]

  static override args = {
    middleware_id: Args.string({
      description: 'Middleware ID',
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json', 'xs'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MiddlewareGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const includeXanoscript = flags.output === 'xs'
      const middleware = await client.getMiddleware(workspaceId, args.middleware_id, includeXanoscript) as Middleware

      if (flags.output === 'json') {
        this.log(JSON.stringify(middleware, null, 2))
      } else if (flags.output === 'xs') {
        if (middleware.xanoscript && middleware.xanoscript.status === 'ok' && middleware.xanoscript.value) {
          this.log(middleware.xanoscript.value)
        } else {
          this.error('XanoScript not available for this middleware')
        }
      } else {
        this.log(`Middleware: ${middleware.name}`)
        this.log(`ID: ${middleware.id}`)
        if (middleware.description) {
          this.log(`Description: ${middleware.description}`)
        }
        if (middleware.guid) {
          this.log(`GUID: ${middleware.guid}`)
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
