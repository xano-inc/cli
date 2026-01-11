import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {Api} from '../../../lib/types.js'

export default class ApiGet extends BaseCommand {
  static override description = 'Get details of a specific API endpoint'

  static override examples = [
    `$ xano api get 5 123 -w 40
API: GET /user (ID: 123)
Description: Get user by ID
Created: 2023-04-19 21:01:32+0000
`,
    `$ xano api get 5 123 -o json
{
  "id": 123,
  "name": "user",
  "verb": "GET",
  ...
}
`,
    `$ xano api get 5 123 -o xs
query user verb=GET {
  input {
    int id
  }
  ...
}
`,
  ]

  static override args = {
    apigroup_id: Args.string({
      description: 'API Group ID',
      required: true,
    }),
    api_id: Args.string({
      description: 'API ID',
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json', 'xs'],
    }),
    include_draft: Flags.boolean({
      description: 'Include draft version',
      required: false,
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ApiGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const includeXanoscript = flags.output === 'xs'
      const api = await client.getApi(workspaceId, args.apigroup_id, args.api_id, {
        include_draft: flags.include_draft,
        include_xanoscript: includeXanoscript,
      }) as Api

      if (flags.output === 'json') {
        this.log(JSON.stringify(api, null, 2))
      } else if (flags.output === 'xs') {
        if (api.xanoscript?.value) {
          this.log(api.xanoscript.value)
        } else if (api.xanoscript?.status === 'error') {
          this.error(`XanoScript error: ${api.xanoscript.message}`)
        } else {
          this.error('XanoScript not available for this API')
        }
      } else {
        this.log(`API: ${api.verb} /${api.name} (ID: ${api.id})`)
        if (api.description) {
          this.log(`Description: ${api.description}`)
        }
        if (api.cache?.active) {
          this.log(`Cache: enabled (TTL: ${api.cache.ttl}s)`)
        }
        if (api.tag && api.tag.length > 0) {
          this.log(`Tags: ${api.tag.join(', ')}`)
        }
        this.log(`Created: ${api.created_at}`)
        this.log(`Updated: ${api.updated_at}`)
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
