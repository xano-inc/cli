import {Args, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Api} from '../../../lib/types.js'

export default class ApiCreate extends BaseCommand {
  static override description = 'Create a new API endpoint in an API group'

  static override examples = [
    `$ xano api create 5 -w 40 --name user --verb GET --description "Get user"
API created successfully!
ID: 123
Name: user
Verb: GET
`,
    `$ xano api create 5 -w 40 -f endpoint.xs
API created successfully!
ID: 123
Name: get_user
Verb: GET
`,
    `$ cat endpoint.xs | xano api create 5 -w 40 --stdin
API created successfully!
`,
  ]

  static override args = {
    apigroup_id: Args.string({
      description: 'API Group ID',
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
      description: 'API endpoint name (path)',
      required: false,
    }),
    verb: Flags.string({
      char: 'v',
      description: 'HTTP verb',
      required: false,
      options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
    }),
    description: Flags.string({
      char: 'd',
      description: 'API endpoint description',
      required: false,
      default: '',
    }),
    branch: Flags.string({
      char: 'b',
      description: 'Branch name',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to file containing API definition (XanoScript .xs or JSON .json)',
      required: false,
      exclusive: ['stdin'],
    }),
    stdin: Flags.boolean({
      char: 's',
      description: 'Read XanoScript code from stdin',
      required: false,
      default: false,
      exclusive: ['file'],
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
    const {args, flags} = await this.parse(ApiCreate)

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
      } else if (flags.stdin) {
        // Read from stdin
        const content = await this.readStdin()
        data = content
        useXanoscript = true
      } else if (flags.name && flags.verb) {
        // Create from flags
        data = {
          name: flags.name,
          description: flags.description,
          verb: flags.verb,
        }
      } else {
        this.error('Either --name and --verb, --file, or --stdin must be provided')
      }

      const result = await client.createApi(workspaceId, args.apigroup_id, data, useXanoscript, flags.branch) as Api

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log('API created successfully!')
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)
        this.log(`Verb: ${result.verb}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(error.message)
      } else {
        this.error(String(error))
      }
    }
  }

  private async readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []

      process.stdin.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })

      process.stdin.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'))
      })

      process.stdin.on('error', (error: Error) => {
        reject(error)
      })

      process.stdin.resume()
    })
  }
}
