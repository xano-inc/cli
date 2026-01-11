import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Middleware} from '../../../lib/types.js'

export default class MiddlewareEdit extends BaseCommand {
  static override description = 'Edit an existing middleware'

  static override examples = [
    `$ xano middleware edit 123 -w 40 --name new_name
Middleware updated successfully!
`,
    `$ xano middleware edit 123 -w 40 --description "Updated description"
Middleware updated successfully!
`,
    `$ xano middleware edit 123 -w 40 -f middleware.xs
Middleware updated from XanoScript file
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
    name: Flags.string({
      char: 'n',
      description: 'New middleware name',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'New middleware description',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to XanoScript file',
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
    const {args, flags} = await this.parse(MiddlewareEdit)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let middleware: Middleware

      if (flags.file) {
        // Update from XanoScript file
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }

        const xsContent = fs.readFileSync(flags.file, 'utf8')
        middleware = await client.updateMiddleware(workspaceId, args.middleware_id, xsContent, true) as Middleware
      } else {
        // Fetch existing middleware to preserve fields
        const existing = await client.getMiddleware(workspaceId, args.middleware_id) as Middleware

        const data: Record<string, unknown> = {
          ...existing,
        }

        if (flags.name !== undefined) {
          data.name = flags.name
        }
        if (flags.description !== undefined) {
          data.description = flags.description
        }

        middleware = await client.updateMiddleware(workspaceId, args.middleware_id, data, false) as Middleware
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(middleware, null, 2))
      } else {
        this.log('Middleware updated successfully!')
        this.log(`ID: ${middleware.id}`)
        this.log(`Name: ${middleware.name}`)
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
