import {Args, Flags} from '@oclif/core'
import BaseCommand from '../../../base-command.js'
import {XanoApiClient} from '../../../lib/api-client.js'
import type {ApiGroup} from '../../../lib/types.js'

export default class ApiGroupGet extends BaseCommand {
  static override description = 'Get details of a specific API group'

  static override examples = [
    `$ xano apigroup get 123 -w 40
API Group: user (ID: 123)
Canonical: api:user
Description: User management APIs
Swagger: enabled
`,
    `$ xano apigroup get 123 -o json
{
  "id": 123,
  "name": "user",
  ...
}
`,
    `$ xano apigroup get 123 -o xs
api_group user {
  canonical = "user"
  swagger = {active: true}
}
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
    output: Flags.string({
      char: 'o',
      description: 'Output format',
      required: false,
      default: 'summary',
      options: ['summary', 'json', 'xs'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ApiGroupGet)

    try {
      const profileName = flags.profile || XanoApiClient.getDefaultProfile()
      const client = XanoApiClient.fromProfile(profileName)
      const workspaceId = client.getWorkspaceId(flags.workspace)

      const includeXanoscript = flags.output === 'xs'
      const apiGroup = await client.getApiGroup(workspaceId, args.apigroup_id, includeXanoscript) as ApiGroup

      if (flags.output === 'json') {
        this.log(JSON.stringify(apiGroup, null, 2))
      } else if (flags.output === 'xs') {
        if (apiGroup.xanoscript?.value) {
          this.log(apiGroup.xanoscript.value)
        } else if (apiGroup.xanoscript?.status === 'error') {
          this.error(`XanoScript error: ${apiGroup.xanoscript.message}`)
        } else {
          this.error('XanoScript not available for this API group')
        }
      } else {
        this.log(`API Group: ${apiGroup.name} (ID: ${apiGroup.id})`)
        this.log(`Canonical: api:${apiGroup.canonical}`)
        if (apiGroup.description) {
          this.log(`Description: ${apiGroup.description}`)
        }
        this.log(`Swagger: ${apiGroup.swagger ? 'enabled' : 'disabled'}`)
        if (apiGroup.branch) {
          this.log(`Branch: ${apiGroup.branch}`)
        }
        if (apiGroup.tag && apiGroup.tag.length > 0) {
          this.log(`Tags: ${apiGroup.tag.join(', ')}`)
        }
        if (apiGroup.documentation?.link) {
          this.log(`Documentation: ${apiGroup.documentation.link}`)
        }
        this.log(`Created: ${apiGroup.created_at}`)
        this.log(`Updated: ${apiGroup.updated_at}`)
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
