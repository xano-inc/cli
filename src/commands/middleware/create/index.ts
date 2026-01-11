import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Middleware} from '../../../lib/types.js'

export default class MiddlewareCreate extends BaseCommand {
  static override description = 'Create a new middleware'

  static override examples = [
    `$ xano middleware create -w 40 --name auth_check --description "Auth middleware"
Middleware created successfully!
ID: 123
Name: auth_check
`,
    `$ xano middleware create -w 40 -f middleware.xs
Middleware created from XanoScript file
ID: 123
`,
    `$ xano middleware create -w 40 -f middleware.xs -o json
{
  "id": 123,
  "name": "auth_check"
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
    name: Flags.string({
      char: 'n',
      description: 'Middleware name (required if not using file)',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'Middleware description',
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
    const {flags} = await this.parse(MiddlewareCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let middleware: Middleware

      if (flags.file) {
        // Create from XanoScript file
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }

        const xsContent = fs.readFileSync(flags.file, 'utf8')
        middleware = await client.createMiddleware(workspaceId, xsContent, true) as Middleware
      } else {
        // Create from flags
        if (!flags.name) {
          this.error('Either --name or --file is required')
        }

        const data = {
          name: flags.name,
          description: flags.description || '',
        }

        middleware = await client.createMiddleware(workspaceId, data, false) as Middleware
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(middleware, null, 2))
      } else {
        this.log('Middleware created successfully!')
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
