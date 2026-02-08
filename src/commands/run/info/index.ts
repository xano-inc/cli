import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import BaseRunCommand from '../../../lib/base-run-command.js'
import type {DocInfoResult} from '../../../lib/run-types.js'

export default class RunInfo extends BaseRunCommand {
  static args = {}

  static override flags = {
    ...BaseRunCommand.baseFlags,
    file: Flags.string({
      char: 'f',
      description: 'Path or URL to file containing XanoScript code',
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

  static description = 'Get information about a XanoScript document (type, inputs, env vars)'

  static examples = [
    `$ xano run info -f script.xs
Document Info:
  Type: job
  Inputs:
    - name (string, required)
    - count (number, optional)
  Environment Variables:
    - API_KEY
    - DEBUG
`,
    `$ cat script.xs | xano run info --stdin
Document Info:
  Type: service
  Inputs: none
  Environment Variables: none
`,
    `$ xano run info -f script.xs -o json
{ "type": "job", "input": { "name": {...} }, "env": ["API_KEY"] }
`,
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(RunInfo)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile, flags.verbose)

    // Read XanoScript content
    let xanoscript: string

    if (flags.file) {
      if (this.isUrl(flags.file)) {
        // Fetch URL content
        try {
          const response = await fetch(flags.file)
          if (!response.ok) {
            this.error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
          }
          xanoscript = await response.text()
        } catch (error) {
          this.error(`Failed to fetch URL '${flags.file}': ${error}`)
        }
      } else {
        try {
          xanoscript = fs.readFileSync(flags.file, 'utf8')
        } catch (error) {
          this.error(`Failed to read file '${flags.file}': ${error}`)
        }
      }
    } else if (flags.stdin) {
      try {
        xanoscript = await this.readStdin()
      } catch (error) {
        this.error(`Failed to read from stdin: ${error}`)
      }
    } else {
      this.error('Either --file or --stdin must be specified to provide XanoScript code')
    }

    // Validate xanoscript is not empty
    if (!xanoscript || xanoscript.trim().length === 0) {
      this.error('XanoScript content is empty')
    }

    // Get document info via API
    try {
      const url = this.httpClient.buildProjectUrl('/doc/info')
      const result = await this.httpClient.post<DocInfoResult>(url, {doc: xanoscript})

      if (flags.output === 'json') {
        this.outputJson(result)
      } else {
        this.outputSummary(result)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get document info: ${error.message}`)
      } else {
        this.error(`Failed to get document info: ${String(error)}`)
      }
    }
  }

  private outputSummary(result: DocInfoResult): void {
    this.log('Document Info:')
    this.log(`  Type: ${result.type}`)
    this.log('')

    // Display inputs
    this.log('  Inputs:')
    if (result.input && Object.keys(result.input).length > 0) {
      for (const [name, config] of Object.entries(result.input)) {
        const configStr = typeof config === 'object' ? JSON.stringify(config) : String(config)
        this.log(`    - ${name}: ${configStr}`)
      }
    } else {
      this.log('    (none)')
    }
    this.log('')

    // Display environment variables
    this.log('  Environment Variables:')
    if (result.env && result.env.length > 0) {
      for (const envVar of result.env) {
        this.log(`    - ${envVar}`)
      }
    } else {
      this.log('    (none)')
    }
  }

  private isUrl(str: string): boolean {
    return str.startsWith('http://') || str.startsWith('https://')
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
