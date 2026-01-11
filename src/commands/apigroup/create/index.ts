import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {ApiGroup} from '../../../lib/types.js'

export default class ApiGroupCreate extends BaseCommand {
  static override description = 'Create a new API group in a workspace'

  static override examples = [
    `$ xano apigroup create -w 40 --name user --description "User APIs" --swagger
API group created successfully!
ID: 123
Name: user
Canonical: api:user
`,
    `$ xano apigroup create -w 40 -f apigroup.xs
API group created successfully!
ID: 123
Name: products
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
      description: 'API group name',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'API group description',
      required: false,
      default: '',
    }),
    canonical: Flags.string({
      char: 'c',
      description: 'API canonical path (e.g., "user" for api:user)',
      required: false,
    }),
    swagger: Flags.boolean({
      description: 'Enable Swagger documentation',
      required: false,
      default: true,
    }),
    branch: Flags.string({
      char: 'b',
      description: 'Branch name',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to file containing API group definition (XanoScript .xs or JSON .json)',
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
    const {flags} = await this.parse(ApiGroupCreate)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      let data: unknown
      let useXanoscript = false

      if (flags.file) {
        // Read from file
        if (!fs.existsSync(flags.file)) {
          this.error(`File not found: ${flags.file}`)
        }

        const content = fs.readFileSync(flags.file, 'utf8')
        const ext = flags.file.toLowerCase()

        if (ext.endsWith('.xs')) {
          data = content
          useXanoscript = true
        } else if (ext.endsWith('.json')) {
          try {
            data = JSON.parse(content)
          } catch {
            this.error('Invalid JSON file')
          }
        } else {
          this.error('File must be .xs (XanoScript) or .json')
        }
      } else if (flags.name) {
        // Create from flags
        data = {
          name: flags.name,
          description: flags.description,
          swagger: flags.swagger,
          canonical: flags.canonical,
        }
      } else {
        this.error('Either --name or --file must be provided')
      }

      const result = await client.createApiGroup(workspaceId, data, useXanoscript, flags.branch) as ApiGroup

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('API group created successfully!')
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)
        this.log(`Canonical: api:${result.canonical}`)
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
