import {Args, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import * as yaml from 'js-yaml'
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
  // Add other function properties as needed
}

interface FunctionListResponse {
  functions?: Function[]
  items?: Function[]
  // Handle both array and object responses
}

export default class FunctionGet extends BaseCommand {
  static args = {
    function_id: Args.string({
      description: 'Function ID',
      required: false,
    }),
  }
static description = 'Get a specific function from a workspace'
static examples = [
    `$ xano function:get 145 -w 40
Function: yo (ID: 145)
Created: 2025-10-10 10:30:00
Description: Sample function
`,
    `$ xano function:get 145 --profile production
Function: yo (ID: 145)
Created: 2025-10-10 10:30:00
`,
    `$ xano function:get
Select a function:
  ❯ yo (ID: 145) - Sample function
    another-func (ID: 146)
`,
    `$ xano function:get 145 -w 40 --output json
{
  "id": 145,
  "name": "yo",
  "description": "Sample function"
}
`,
    `$ xano function:get 145 -p staging -o json --include_draft
{
  "id": 145,
  "name": "yo"
}
`,
    `$ xano function:get 145 -p staging -o xs
function yo {
  input {
  }
  stack {
  }
  response = null
}
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    include_draft: Flags.boolean({
      default: false,
      description: 'Include draft version',
      required: false,
    }),
    include_xanoscript: Flags.boolean({
      default: false,
      description: 'Include XanoScript in response',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json', 'xs'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(FunctionGet)

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

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano function:get [function_id] -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // If function_id is not provided, prompt user to select from list
    let functionId: string
    functionId = args.function_id ? args.function_id : (await this.promptForFunctionId(profile, workspaceId));

    // Build query parameters
    // Automatically set include_xanoscript to true if output format is xs
    const includeXanoscript = flags.output === 'xs' ? true : flags.include_xanoscript

    const queryParams = new URLSearchParams({
      include_draft: flags.include_draft.toString(),
      include_xanoscript: includeXanoscript.toString(),
    })

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/function/${functionId}?${queryParams.toString()}`

    // Fetch function from the API
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
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const func = await response.json() as Function

      // Validate response is an object
      if (!func || typeof func !== 'object') {
        this.error('Unexpected API response format: expected a function object')
      }

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(func, null, 2))
      } else if (flags.output === 'xs') {
        // xs (XanoScript) format - output only the xanoscript element
        if (func.xanoscript) {
          // If status is "ok", output only the value, otherwise output the full xanoscript object
          if (func.xanoscript.status === 'ok' && func.xanoscript.value !== undefined) {
            this.log(func.xanoscript.value)
          } else {
            this.log(JSON.stringify(func.xanoscript, null, 2))
          }
        } else {
          this.log('null')
        }
      } else {
        // summary format
        this.log(`Function: ${func.name} (ID: ${func.id})`)

        if (func.created_at) {
          this.log(`Created: ${func.created_at}`)
        }

        if (func.description) {
          this.log(`Description: ${func.description}`)
        }

        if (func.type) {
          this.log(`Type: ${func.type}`)
        }

        // Don't display xanoscript in summary mode as it can be very large
        if (func.xanoscript) {
          this.log(`XanoScript: (available with -o xs or -o json)`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch function: ${error.message}`)
      } else {
        this.error(`Failed to fetch function: ${String(error)}`)
      }
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
          message: 'Select a function:',
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
}
