import {Args, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import * as yaml from 'js-yaml'
import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../base-command.js'

interface ProfileConfig {
  access_token: string
  account_origin?: string
  branch?: string
  instance_origin: string
  workspace?: string
}

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: ProfileConfig
  }
}

interface Function {
  created_at?: number | string
  description?: string
  id: number
  name: string
  type?: string
  updated_at?: number | string
  xanoscript?: any
}

interface FunctionListResponse {
  functions?: Function[]
  items?: Function[]
}

interface EditFunctionResponse {
  [key: string]: any
  id: number
  name: string
}

export default class FunctionEdit extends BaseCommand {
  static args = {
    function_id: Args.string({
      description: 'Function ID to edit',
      required: false,
    }),
  }
static description = 'Edit a function in a workspace'
static examples = [
    `$ xano function:edit 163
# Fetches the function code and opens it in $EDITOR for editing
Function updated successfully!
ID: 163
Name: my_function
`,
    `$ xano function:edit
# Prompts for function, fetches the code and opens it in $EDITOR for editing
Select a function to edit:
  ❯ my_function (ID: 163) - Sample function
    another-func (ID: 164)
`,
    `$ xano function:edit 163 -f function.xs
Function updated successfully!
ID: 163
Name: my_function
`,
    `$ xano function:edit 163 -w 40 -f function.xs
Function updated successfully!
ID: 163
Name: my_function
`,
    `$ xano function:edit -f function.xs
Select a function to edit:
  ❯ my_function (ID: 163) - Sample function
    another-func (ID: 164)
`,
    `$ xano function:edit 163 -f function.xs --edit
# Opens function.xs in $EDITOR, then updates function with edited content
Function updated successfully!
ID: 163
Name: my_function
`,
    `$ cat function.xs | xano function:edit 163 --stdin
Function updated successfully!
ID: 163
Name: my_function
`,
    `$ xano function:edit 163 -f function.xs -o json
{
  "id": 163,
  "name": "my_function",
  ...
}
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    edit: Flags.boolean({
      char: 'e',
      default: false,
      description: 'Open file in editor before updating function (requires --file)',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path to file containing XanoScript code',
      exclusive: ['stdin'],
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    publish: Flags.boolean({
      default: true,
      description: 'Publish the function after editing',
      required: false,
    }),
    stdin: Flags.boolean({
      char: 's',
      default: false,
      description: 'Read XanoScript code from stdin',
      exclusive: ['file'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionEdit)

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

    // Validate flag combinations
    if (flags.edit && !flags.file) {
      this.error('The --edit flag requires --file to be specified')
    }

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano function:edit [function_id] -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // If function_id is not provided, prompt user to select from list
    let functionId: string
    functionId = args.function_id ? args.function_id : (await this.promptForFunctionId(profile, workspaceId));

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
      // Default: Fetch from API and open in editor
      try {
        xanoscript = await this.fetchFunctionCode(profile, workspaceId, functionId)
        // Automatically open in editor when fetching
        xanoscript = await this.editFunctionContent(xanoscript)
      } catch (error) {
        this.error(`Failed to fetch function: ${error}`)
      }
    }

    // Validate xanoscript is not empty
    if (!xanoscript || xanoscript.trim().length === 0) {
      this.error('XanoScript content is empty')
    }

    // Construct the API URL
    const queryParams = new URLSearchParams({
      include_xanoscript: 'false',
      publish: flags.publish ? 'true' : 'false',
    })
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/function/${functionId}?${queryParams.toString()}`

    // Update function via API
    try {
      const response = await fetch(apiUrl, {
        body: xanoscript,
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
          'Content-Type': 'text/x-xanoscript',
        },
        method: 'PUT',
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const result = await response.json() as EditFunctionResponse

      // Validate response
      if (!result || typeof result !== 'object') {
        this.error('Unexpected API response format')
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        // summary format
        this.log('Function updated successfully!')
        this.log(`ID: ${result.id}`)
        this.log(`Name: ${result.name}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to update function: ${error.message}`)
      } else {
        this.error(`Failed to update function: ${String(error)}`)
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

  private async editFunctionContent(xanoscript: string): Promise<string> {
    // Get the EDITOR environment variable
    const editor = process.env.EDITOR || process.env.VISUAL

    if (!editor) {
      throw new Error('No editor configured. Please set the EDITOR or VISUAL environment variable. Example: export EDITOR=vim')
    }

    // Validate editor executable exists
    try {
      execSync(`which ${editor.split(' ')[0]}`, {stdio: 'ignore'})
    } catch {
      throw new Error(`Editor '${editor}' not found. Please set EDITOR to a valid editor. Example: export EDITOR=vim`)
    }

    // Create a temporary file with .xs extension
    const tmpFile = path.join(os.tmpdir(), `xano-edit-${Date.now()}.xs`)

    // Write content to temp file
    try {
      fs.writeFileSync(tmpFile, xanoscript, 'utf8')
    } catch (error) {
      throw new Error(`Failed to create temporary file: ${error}`)
    }

    // Open the editor
    try {
      execSync(`${editor} "${tmpFile}"`, {stdio: 'inherit'})
    } catch (error) {
      // Clean up temp file
      try {
        fs.unlinkSync(tmpFile)
      } catch {
        // Ignore cleanup errors
      }

      throw new Error(`Editor exited with an error: ${error}`)
    }

    // Read the edited content
    try {
      const editedContent = fs.readFileSync(tmpFile, 'utf8')
      // Clean up temp file
      try {
        fs.unlinkSync(tmpFile)
      } catch {
        // Ignore cleanup errors
      }

      return editedContent
    } catch (error) {
      throw new Error(`Failed to read edited file: ${error}`)
    }
  }

  private async fetchFunctionCode(profile: ProfileConfig, workspaceId: string, functionId: string): Promise<string> {
    const queryParams = new URLSearchParams({
      include_xanoscript: 'true',
    })
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/function/${functionId}?${queryParams.toString()}`

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const result = await response.json() as any

      // Handle xanoscript as an object with status and value
      if (result.xanoscript) {
        if (result.xanoscript.status === 'ok' && result.xanoscript.value !== undefined) {
          return result.xanoscript.value
        }

 if (typeof result.xanoscript === 'string') {
          return result.xanoscript
        }
 
          throw new Error(`Invalid xanoscript format: ${JSON.stringify(result.xanoscript)}`)
        
      }

      return ''
    } catch (error) {
      throw error
    }
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

  private async promptForFunctionId(profile: ProfileConfig, workspaceId: string): Promise<string> {
    try {
      // Fetch list of functions
      const queryParams = new URLSearchParams({
        include_draft: 'false',
        include_xanoscript: 'false',
        order: 'desc',
        page: '1',
        per_page: '50',
        sort: 'created_at',
      })

      const listUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/function?${queryParams.toString()}`

      const response = await fetch(listUrl, {
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `Failed to fetch function list: ${response.status} ${response.statusText}\n${errorText}`,
        )
      }

      const data = await response.json() as Function[] | FunctionListResponse

      // Handle different response formats
      let functions: Function[]

      if (Array.isArray(data)) {
        functions = data
      } else if (data && typeof data === 'object' && 'functions' in data && Array.isArray(data.functions)) {
        functions = data.functions
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        functions = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (functions.length === 0) {
        this.error('No functions found in workspace')
      }

      // Create choices for inquirer
      const choices = functions.map(func => ({
        name: `${func.name} (ID: ${func.id})${func.description ? ` - ${func.description}` : ''}`,
        value: func.id.toString(),
      }))

      // Prompt user to select a function
      const answer = await inquirer.prompt([
        {
          choices,
          message: 'Select a function to edit:',
          name: 'functionId',
          type: 'list',
        },
      ])

      return answer.functionId
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to prompt for function: ${error.message}`)
      } else {
        this.error(`Failed to prompt for function: ${String(error)}`)
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

      // Resume stdin if it was paused
      process.stdin.resume()
    })
  }
}
