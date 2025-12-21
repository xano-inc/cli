import {Flags} from '@oclif/core'
import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import BaseCommand from '../../../../base-command.js'

interface ProfileConfig {
  account_origin?: string
  instance_origin: string
  access_token: string
  workspace?: string
  branch?: string
}

interface CredentialsFile {
  profiles: {
    [key: string]: ProfileConfig
  }
  default?: string
}

interface EphemeralJobResult {
  total_time: number
  pre_time: number
  boot_time: number
  post_time: number
  main_time: number
  response: any
}

interface EphemeralJobResponse {
  job: {
    id: number
    run: {
      id: number
    }
  }
  result: EphemeralJobResult
}

export default class EphemeralRunJob extends BaseCommand {
  static args = {}

  static override flags = {
    ...BaseCommand.baseFlags,
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
    edit: Flags.boolean({
      char: 'e',
      description: 'Open file in editor before running job (requires --file)',
      required: false,
      default: false,
      dependsOn: ['file'],
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
  }

  static description = 'Run an ephemeral job'

  static examples = [
    `$ xano ephemeral:run:job -f script.xs
Job executed successfully!
...
`,
    `$ xano ephemeral:run:job -f script.xs --edit
# Opens script.xs in $EDITOR, then runs job with edited content
Job executed successfully!
...
`,
    `$ cat script.xs | xano ephemeral:run:job --stdin
Job executed successfully!
...
`,
    `$ xano ephemeral:run:job -f script.xs -o json
{
  "job": { "id": 1, "run": { "id": 1 } },
  "result": { ... }
}
`,
    `$ xano ephemeral:run:job -f script.xs -a args.json
# Runs job with input arguments from args.json
Job executed successfully!
...
`,
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(EphemeralRunJob)

    // Get profile name (default or from flag/env)
    const profileName = flags.profile || this.getDefaultProfile()

    // Load credentials
    const credentials = this.loadCredentials()

    // Get the profile configuration
    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xano profile:create'`,
      )
    }

    const profile = credentials.profiles[profileName]

    // Validate required fields
    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    // Read XanoScript content or use URL
    let xanoscript: string | undefined
    let xanoscriptUrl: string | undefined

    if (flags.file) {
      if (this.isUrl(flags.file)) {
        // Pass URL directly to API
        xanoscriptUrl = flags.file
      } else if (flags.edit) {
        // If edit flag is set, copy to temp file and open in editor
        const fileToRead = await this.editFile(flags.file)
        xanoscript = fs.readFileSync(fileToRead, 'utf8')
        // Clean up temp file
        try {
          fs.unlinkSync(fileToRead)
        } catch {
          // Ignore cleanup errors
        }
      } else {
        try {
          xanoscript = fs.readFileSync(flags.file, 'utf8')
        } catch (error) {
          this.error(`Failed to read file '${flags.file}': ${error}`)
        }
      }
    } else if (flags.stdin) {
      // Read from stdin
      try {
        xanoscript = await this.readStdin()
      } catch (error) {
        this.error(`Failed to read from stdin: ${error}`)
      }
    } else {
      this.error('Either --file or --stdin must be specified to provide XanoScript code')
    }

    // Validate xanoscript is not empty (only if not using URL)
    if (!xanoscriptUrl && (!xanoscript || xanoscript.trim().length === 0)) {
      this.error('XanoScript content is empty')
    }

    // Load args from JSON file/URL if provided
    let inputArgs: Record<string, unknown> | undefined
    let inputArgsUrl: string | undefined
    if (flags.args) {
      if (this.isUrl(flags.args)) {
        // Pass URL directly to API
        inputArgsUrl = flags.args
      } else {
        try {
          const argsContent = fs.readFileSync(flags.args, 'utf8')
          inputArgs = JSON.parse(argsContent)
        } catch (error) {
          this.error(`Failed to read or parse args '${flags.args}': ${error}`)
        }
      }
    }

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/beta/ephemeral/job`

    // Build request body
    const formData = new FormData()
    if (xanoscriptUrl) {
      formData.append('doc', xanoscriptUrl)
    } else {
      formData.append('doc', xanoscript!)
    }
    if (inputArgsUrl) {
      formData.append('args', inputArgsUrl)
    } else if (inputArgs) {
      formData.append('args', JSON.stringify(inputArgs))
    }
    const requestBody = formData

    // Run ephemeral job via API
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        body: requestBody,
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const result = await response.json() as EphemeralJobResponse

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        // summary format
        this.log('Job executed successfully!')
        this.log('')
        this.log(`  Job ID:    ${result.job.id}`)
        this.log(`  Run ID:    ${result.job.run.id}`)
        this.log('')
        this.log('  Timing:')
        this.log(`    Total:   ${(result.result.total_time * 1000).toFixed(2)}ms`)
        this.log(`    Boot:    ${(result.result.boot_time * 1000).toFixed(2)}ms`)
        this.log(`    Main:    ${(result.result.main_time * 1000).toFixed(2)}ms`)
        this.log(`    Pre:     ${(result.result.pre_time * 1000).toFixed(2)}ms`)
        this.log(`    Post:    ${(result.result.post_time * 1000).toFixed(2)}ms`)
        this.log('')
        this.log('  Response:')
        const responseStr = typeof result.result.response === 'string'
          ? result.result.response
          : JSON.stringify(result.result.response, null, 2)
        // Indent multiline response
        const indentedResponse = responseStr.split('\n').map((line: string) => `    ${line}`).join('\n')
        this.log(indentedResponse)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to run ephemeral job: ${error.message}`)
      } else {
        this.error(`Failed to run ephemeral job: ${String(error)}`)
      }
    }
  }

  private async editFile(filePath: string): Promise<string> {
    // Get the EDITOR environment variable
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
      // Clean up temp file
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

      // Resume stdin if it was paused
      process.stdin.resume()
    })
  }

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      this.error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile:create'`,
      )
    }

    // Read credentials file
    try {
      const fileContent = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = yaml.load(fileContent) as CredentialsFile

      if (!parsed || typeof parsed !== 'object' || !('profiles' in parsed)) {
        this.error('Credentials file has invalid format.')
      }

      return parsed
    } catch (error) {
      this.error(`Failed to parse credentials file: ${error}`)
    }
  }
}
