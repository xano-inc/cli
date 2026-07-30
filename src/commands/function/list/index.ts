import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'
import {buildPagingJson, formatPagingFooter, normalizeListResponse, pagingFlags} from '../../../utils/paging.js'

interface Function {
  created_at?: number
  description?: string
  id: number
  name: string
  type?: string
  updated_at?: number
  // Add other function properties as needed
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
{
  "count": 1,
  "page": 1,
  "per_page": 50,
  "next_page": 2,
  "items": [
    {
      "id": 1,
      "name": "function-1"
    }
  ]
}
`,
    `$ xano function:list -p staging -o json --include_draft
{
  "count": 1,
  "page": 1,
  "items": [
    {
      "id": 1,
      "name": "function-1"
    }
  ]
}
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
    ...pagingFlags('envelope', {maxPerPage: 10_000}),
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

    const {profile, profileName} = this.resolveProfile(flags)

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
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const list = normalizeListResponse<Function>(await response.json(), ['functions'])
      const functions = list.items

      // Output results
      if (flags.output === 'json') {
        this.log(JSON.stringify(buildPagingJson(list, {page: flags.page, perPage: flags.per_page, tier: 'envelope'}), null, 2))
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

        const footer = formatPagingFooter(list, {noun: 'function', page: flags.page, tier: 'envelope'})
        if (footer) this.log(footer)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch functions: ${error.message}`)
      } else {
        this.error(`Failed to fetch functions: ${String(error)}`)
      }
    }
  }

}
