import {Args, Flags} from '@oclif/core'
import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import BaseRunCommand from '../../../lib/base-run-command.js'
import type {RunResult} from '../../../lib/run-types.js'

export default class RunExec extends BaseRunCommand {
  static args = {
    path: Args.string({
      description: 'Path to file or directory containing XanoScript code (directory creates multidoc from .xs files)',
      required: false,
    }),
  }

  static override flags = {
    ...BaseRunCommand.baseFlags,
    file: Flags.string({
      char: 'f',
      description: 'Path or URL to file containing XanoScript code (deprecated: use path argument instead)',
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
    edit: Flags.boolean({
      char: 'e',
      description: 'Open file in editor before running (requires path argument or --file)',
      required: false,
      default: false,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json'],
    }),
    args: Flags.string({
      char: 'a',
      description: 'Path or URL to JSON file containing input arguments',
      required: false,
    }),
    env: Flags.string({
      description: 'Environment variable override (key=value)',
      required: false,
      multiple: true,
    }),
  }

  static description = 'Execute XanoScript code (job or service)'

  static examples = [
    `$ xano run exec script.xs
Executed successfully!
...
`,
    `$ xano run exec ./my-workspace
# Executes all .xs files in directory as multidoc
Executed successfully!
...
`,
    `$ xano run exec script.xs --edit
# Opens script.xs in $EDITOR, then executes
Executed successfully!
...
`,
    `$ cat script.xs | xano run exec --stdin
Executed successfully!
...
`,
    `$ xano run exec script.xs -o json
{
  "run": { ... }
}
`,
    `$ xano run exec script.xs -a args.json
# Executes with input arguments from args.json
Executed successfully!
...
`,
    `$ xano run exec script.xs --env API_KEY=secret --env DEBUG=true
# Executes with environment variable overrides
Executed successfully!
...
`,
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(RunExec)

    // Initialize with project required
    await this.initRunCommandWithProject(flags.profile, flags.verbose)

    // Determine input source: path argument, --file flag, or --stdin
    const inputPath = args.path || flags.file

    // Validate --edit flag requirements
    if (flags.edit) {
      if (!inputPath) {
        this.error('--edit requires a file path (either path argument or --file flag)')
      }
      if (this.isUrl(inputPath)) {
        this.error('--edit cannot be used with URLs')
      }
      if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) {
        this.error('--edit cannot be used with directories')
      }
    }

    // Read XanoScript content
    let xanoscript: string

    if (inputPath) {
      if (this.isUrl(inputPath)) {
        // Fetch URL content
        try {
          const response = await fetch(inputPath)
          if (!response.ok) {
            this.error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
          }
          xanoscript = await response.text()
        } catch (error) {
          this.error(`Failed to fetch URL '${inputPath}': ${error}`)
        }
      } else if (fs.existsSync(inputPath) && fs.statSync(inputPath).isDirectory()) {
        // Handle directory - collect .xs files and create multidoc
        xanoscript = this.loadMultidocFromDirectory(inputPath)
      } else if (flags.edit) {
        // If edit flag is set, copy to temp file and open in editor
        const fileToRead = await this.editFile(inputPath)
        xanoscript = fs.readFileSync(fileToRead, 'utf8')
        // Clean up temp file
        try {
          fs.unlinkSync(fileToRead)
        } catch {
          // Ignore cleanup errors
        }
      } else {
        try {
          xanoscript = fs.readFileSync(inputPath, 'utf8')
        } catch (error) {
          this.error(`Failed to read file '${inputPath}': ${error}`)
        }
      }
    } else if (flags.stdin) {
      try {
        xanoscript = await this.readStdin()
      } catch (error) {
        this.error(`Failed to read from stdin: ${error}`)
      }
    } else {
      this.error('Either a path argument, --file, or --stdin must be specified to provide XanoScript code')
    }

    // Validate xanoscript is not empty
    if (!xanoscript || xanoscript.trim().length === 0) {
      this.error('XanoScript content is empty')
    }

    // Load args from JSON file or URL if provided
    let inputArgs: Record<string, unknown> | undefined
    if (flags.args) {
      if (this.isUrl(flags.args)) {
        try {
          const response = await fetch(flags.args)
          if (!response.ok) {
            this.error(`Failed to fetch args URL: ${response.status} ${response.statusText}`)
          }
          const argsContent = await response.text()
          inputArgs = JSON.parse(argsContent)
        } catch (error) {
          this.error(`Failed to fetch or parse args '${flags.args}': ${error}`)
        }
      } else {
        try {
          const argsContent = fs.readFileSync(flags.args, 'utf8')
          inputArgs = JSON.parse(argsContent)
        } catch (error) {
          this.error(`Failed to read or parse args '${flags.args}': ${error}`)
        }
      }
    }

    // Parse env overrides
    let envOverrides: Record<string, string> | undefined
    if (flags.env && flags.env.length > 0) {
      envOverrides = {}
      for (const envStr of flags.env) {
        const eqIndex = envStr.indexOf('=')
        if (eqIndex === -1) {
          this.error(`Invalid env format '${envStr}'. Expected format: key=value`)
        }
        const key = envStr.slice(0, eqIndex)
        const value = envStr.slice(eqIndex + 1)
        envOverrides[key] = value
      }
    }

    // Build query params
    const queryParams: Record<string, unknown> = {}
    if (inputArgs) {
      queryParams.args = inputArgs
    }
    if (envOverrides) {
      queryParams.env = envOverrides
    }

    // Execute via API
    try {
      const url = this.httpClient.buildProjectUrl('/run/exec', queryParams)
      const result = await this.httpClient.postXanoScript<RunResult>(url, xanoscript)

      // Output results
      if (flags.output === 'json') {
        this.outputJson(result)
      } else {
        this.outputSummary(result)
      }
    } catch (error) {
      if (error instanceof Error) {
        const xanoError = error as Error & {response?: unknown}
        if (xanoError.response) {
          const responseStr = typeof xanoError.response === 'string'
            ? xanoError.response
            : JSON.stringify(xanoError.response, null, 2)
          this.error(`Failed to execute: ${error.message}\n\n${responseStr}`)
        } else {
          this.error(`Failed to execute: ${error.message}`)
        }
      } else {
        this.error(`Failed to execute: ${String(error)}`)
      }
    }
  }

  /**
   * Load all .xs files from a directory and combine them into a multidoc.
   */
  private loadMultidocFromDirectory(dir: string): string {
    const resolvedDir = path.resolve(dir)

    if (!fs.existsSync(resolvedDir)) {
      this.error(`Directory not found: ${resolvedDir}`)
    }

    const files = this.collectFiles(resolvedDir)

    if (files.length === 0) {
      this.error(`No .xs files found in ${dir}`)
    }

    // Read each file and join with --- separator
    const documents: string[] = []
    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8').trim()
      if (content) {
        documents.push(content)
      }
    }

    if (documents.length === 0) {
      this.error(`All .xs files in ${dir} are empty`)
    }

    return documents.join('\n---\n')
  }

  /**
   * Recursively collect all .xs files from a directory, sorted for deterministic ordering.
   */
  private collectFiles(dir: string): string[] {
    const files: string[] = []
    const entries = fs.readdirSync(dir, {withFileTypes: true})

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...this.collectFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.xs')) {
        files.push(fullPath)
      }
    }

    return files.sort()
  }

  private outputSummary(result: RunResult): void {
    this.log('Executed successfully!')
    this.log('')

    // Handle service-specific output
    if (result.service) {
      this.log(`  Service ID: ${result.service.id}`)
      this.log(`  Run ID:     ${result.service.run.id}`)
      this.log('')
    }

    // Handle run/session info
    if (result.run?.id) {
      this.log(`  Run ID:     ${result.run.id}`)
    }
    if (result.run?.session) {
      const session = result.run.session
      this.log(`  Session ID: ${session.id}`)
      this.log(`  State:      ${session.state}`)
      this.log('')
    }

    // Handle timing info
    const timing = result.run?.result || result.run?.session || result.result
    if (timing) {
      const formatTime = (time: number | undefined) =>
        time !== undefined ? `${(time * 1000).toFixed(2)}ms` : undefined

      const times = [
        {label: 'Total', value: formatTime(timing.total_time)},
        {label: 'Boot', value: formatTime(timing.boot_time)},
        {label: 'Main', value: formatTime(timing.main_time)},
        {label: 'Pre', value: formatTime(timing.pre_time)},
        {label: 'Post', value: formatTime(timing.post_time)},
      ].filter(t => t.value !== undefined)

      if (times.length > 0) {
        this.log('  Timing:')
        for (const t of times) {
          this.log(`    ${t.label.padEnd(6)} ${t.value}`)
        }
        this.log('')
      }
    }

    // Handle service endpoints
    if (result.result?.endpoints && result.result.endpoints.length > 0) {
      this.log('  Endpoints:')
      for (const endpoint of result.result.endpoints) {
        this.log(`    ${endpoint.verb.padEnd(6)} ${endpoint.url}`)
        if (endpoint.input.length > 0) {
          for (const input of endpoint.input) {
            const required = input.required ? '*' : ''
            const nullable = input.nullable ? '?' : ''
            this.log(`             └─ ${input.name}${required}: ${input.type}${nullable} (${input.source})`)
          }
        }
      }
      this.log('')
    }

    // Handle metadata API
    if (result.result?.metadata_api) {
      this.log('  Metadata API:')
      this.log(`    ${result.result.metadata_api.url}`)
      this.log('')
    }

    // Handle response
    const response = result.run?.result?.response ?? result.run?.session?.response ?? result.result?.response
    if (response !== undefined) {
      this.log('  Response:')
      const responseStr = typeof response === 'string'
        ? response
        : JSON.stringify(response, null, 2)
      const indentedResponse = responseStr.split('\n').map((line: string) => `    ${line}`).join('\n')
      this.log(indentedResponse)
    }

    // Handle problems/errors
    if (result.run?.problems && result.run.problems.length > 0) {
      this.log('')
      this.log('  Problems:')
      for (const problem of result.run.problems) {
        this.log(`    - [${problem.severity}] ${problem.message}`)
      }
    }

    if (result.run?.session?.error_msg) {
      this.log('')
      this.log(`  Error: ${result.run.session.error_msg}`)
    }
  }

  // Editor value comes from EDITOR/VISUAL environment variables, not user input
  private async editFile(filePath: string): Promise<string> {
    const editor = process.env.EDITOR || process.env.VISUAL

    if (!editor) {
      this.error(
        'No editor configured. Please set the EDITOR or VISUAL environment variable.\n' +
        'Example: export EDITOR=vim',
      )
    }

    // Validate editor executable exists
    try {
      execSync(`which ${editor.split(' ')[0]}`, {stdio: 'ignore'})
    } catch {
      this.error(
        `Editor '${editor}' not found. Please set EDITOR to a valid editor.\n` +
        'Example: export EDITOR=vim',
      )
    }

    // Read the original file
    let originalContent: string
    try {
      originalContent = fs.readFileSync(filePath, 'utf8')
    } catch (error) {
      this.error(`Failed to read file '${filePath}': ${error}`)
    }

    // Create a temporary file with the same extension
    const ext = path.extname(filePath)
    const tmpFile = path.join(os.tmpdir(), `xano-edit-${Date.now()}${ext}`)

    // Copy content to temp file
    try {
      fs.writeFileSync(tmpFile, originalContent, 'utf8')
    } catch (error) {
      this.error(`Failed to create temporary file: ${error}`)
    }

    // Open the editor
    try {
      execSync(`${editor} ${tmpFile}`, {stdio: 'inherit'})
    } catch (error) {
      try {
        fs.unlinkSync(tmpFile)
      } catch {
        // Ignore cleanup errors
      }
      this.error(`Editor exited with an error: ${error}`)
    }

    return tmpFile
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
