import {Args, Flags} from '@oclif/core'
import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import BaseCommand from '../../../base-command.js'

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
}

interface CreateFunctionResponse {
  id: number
  name: string
  [key: string]: any
}

export default class FunctionCreate extends BaseCommand {
  static args = {
    workspace_id: Args.string({
      description: 'Workspace ID (or name if stored in profile)',
      required: false,
    }),
  }

  static override flags = {
    ...BaseCommand.baseFlags,
    file: Flags.string({
      char: 'f',
      description: 'Path to file containing XanoScript code',
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
      description: 'Open file in editor before creating function (requires --file)',
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
  }

  static description = 'Create a new function in a workspace'

  static examples = [
    `$ xscli function:create 40 -f function.xs
Function created successfully!
ID: 123
Name: my_function
`,
    `$ xscli function:create 40 -f function.xs --edit
# Opens function.xs in $EDITOR, then creates function with edited content
Function created successfully!
ID: 123
Name: my_function
`,
    `$ cat function.xs | xscli function:create 40 --stdin
Function created successfully!
ID: 123
Name: my_function
`,
    `$ xscli function:create 40 -f function.xs -o json
{
  "id": 123,
  "name": "my_function",
  ...
}
`,
  ]

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionCreate)

    // Get profile name (default or from flag/env)
    const profileName = flags.profile || 'default'

    // Load credentials
    const credentials = this.loadCredentials()

    // Get the profile configuration
    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xscli profile:create'`,
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

    // Determine workspace_id from argument or profile
    let workspaceId: string
    if (args.workspace_id) {
      workspaceId = args.workspace_id
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as an argument: xscli function:create <workspace_id>\n` +
        `  2. Set it in your profile using: xscli profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Read XanoScript content
    let xanoscript: string
    if (flags.file) {
      // Read from file
      let fileToRead = flags.file

      // If edit flag is set, copy to temp file and open in editor
      if (flags.edit) {
        fileToRead = await this.editFile(flags.file)
      }

      try {
        xanoscript = fs.readFileSync(fileToRead, 'utf8')

        // Clean up temp file if it was created
        if (flags.edit && fileToRead !== flags.file) {
          try {
            fs.unlinkSync(fileToRead)
          } catch {
            // Ignore cleanup errors
          }
        }
      } catch (error) {
        this.error(`Failed to read file '${fileToRead}': ${error}`)
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

    // Validate xanoscript is not empty
    if (!xanoscript || xanoscript.trim().length === 0) {
      this.error('XanoScript content is empty')
    }

    // Construct the API URL
    const queryParams = new URLSearchParams({
      include_xanoscript: 'false',
    })
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/function?${queryParams.toString()}`

    // Create function via API
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'text/x-xanoscript',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        body: xanoscript,
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const result = await response.json() as CreateFunctionResponse

      // Validate response
      if (!result || typeof result !== 'object') {
        this.error('Unexpected API response format')
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        // summary format
        this.log('Function created successfully!')
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create function: ${error.message}`)
      } else {
        this.error(`Failed to create function: ${String(error)}`)
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
    const tmpFile = path.join(os.tmpdir(), `xscli-edit-${Date.now()}${ext}`)

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
        `Create a profile using 'xscli profile:create'`,
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
