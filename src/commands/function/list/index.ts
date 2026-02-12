import {Flags} from '@oclif/core'
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
  created_at?: number
  description?: string
  id: number
  name: string
  type?: string
  updated_at?: number
  // Add other function properties as needed
}

interface FunctionListResponse {
  functions?: Function[]
  items?: Function[]
  // Handle both array and object responses
}

export default class FunctionList extends BaseCommand {
  static args = {}
static description = 'List all functions in a workspace from the Xano Metadata API'
static examples = [
    `$ xano function:list -w 40
Available functions:
  - function-1 (ID: 1)
  - function-2 (ID: 2)
  - function-3 (ID: 3)
`,
    `$ xano function:list --profile production
Available functions:
  - my-function (ID: 1)
  - another-function (ID: 2)
`,
    `$ xano function:list -w 40 --output json
[
  {
    "id": 1,
    "name": "function-1"
  }
]
`,
    `$ xano function:list -p staging -o json --include_draft
[
  {
    "id": 1,
    "name": "function-1"
  }
]
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    include_draft: Flags.boolean({
      default: false,
      description: 'Include draft functions',
      required: false,
    }),
    include_xanoscript: Flags.boolean({
      default: false,
      description: 'Include XanoScript in response',
      required: false,
    }),
    order: Flags.string({
      default: 'desc',
      description: 'Sort order',
      options: ['asc', 'desc'],
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    page: Flags.integer({
      default: 1,
      description: 'Page number for pagination',
      required: false,
    }),
    per_page: Flags.integer({
      default: 50,
      description: 'Number of results per page',
      required: false,
    }),
    sort: Flags.string({
      default: 'created_at',
      description: 'Sort field',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(FunctionList)

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
        `  1. Provide it as a flag: xano function:list -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Build query parameters
    const queryParams = new URLSearchParams({
      include_draft: flags.include_draft.toString(),
      include_xanoscript: flags.include_xanoscript.toString(),
      order: flags.order,
      page: flags.page.toString(),
      per_page: flags.per_page.toString(),
      sort: flags.sort,
    })

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/function?${queryParams.toString()}`

    // Fetch functions from the API
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

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(functions, null, 2))
      } else {
        // summary format
        if (functions.length === 0) {
          this.log('No functions found')
        } else {
          this.log('Available functions:')
          for (const func of functions) {
            if (func.id === undefined) {
              this.log(`  - ${func.name}`)
            } else {
              this.log(`  - ${func.name} (ID: ${func.id})`)
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch functions: ${error.message}`)
      } else {
        this.error(`Failed to fetch functions: ${String(error)}`)
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
}
