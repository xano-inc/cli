import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface KnowledgeItem {
  content?: string
  description?: string
  enabled: boolean
  guid: string
  id: number
  knowledge_type: string
  locked: boolean
  mode: string
  name: null | string
  references?: string[]
  scope?: string
}

interface KnowledgeListResponse {
  items: KnowledgeItem[]
}

export default class KnowledgeGet extends BaseCommand {
  static override args = {
    name: Args.string({
      description: 'Knowledge item name',
      required: true,
    }),
  }
  static override description = 'Get a knowledge item by name, or one of its reference files'
  static override examples = [
    '$ xano knowledge get "deploy-runbook" -w 40',
    '$ xano knowledge get "deploy-runbook" -w 40 --output json',
    '$ xano knowledge get "deploy-runbook" -w 40 --file checklist.md',
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch ID',
      required: false,
    }),
    file: Flags.string({
      char: 'f',
      description: 'Path of a reference file to fetch instead of the main content',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'text',
      description: 'Output format',
      options: ['text', 'json'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(KnowledgeGet)
    const {profile, profileName} = this.resolveProfile(flags)

    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano knowledge get <name> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    const queryParams = new URLSearchParams()
    queryParams.set('enabled_only', 'false')
    queryParams.set('include_content', 'true')

    if (flags.branch) {
      queryParams.set('branch_id', flags.branch)
    }

    const listUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/knowledge?${queryParams.toString()}`

    try {
      const listResponse = await this.verboseFetch(
        listUrl,
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

      if (!listResponse.ok) {
        const errorText = await listResponse.text()
        this.error(
          `API request failed with status ${listResponse.status}: ${listResponse.statusText}\n${errorText}`,
        )
      }

      const data = await listResponse.json() as KnowledgeListResponse
      const items: KnowledgeItem[] = Array.isArray(data) ? data : (data.items ?? [])

      const targetName = args.name.toLowerCase()
      const item = items.find((i) => i.name?.toLowerCase() === targetName)

      if (!item) {
        const available = items.map((i) => i.name).filter(Boolean).join(', ')
        this.error(
          `Knowledge item not found: "${args.name}"\n` +
          (available ? `Available items: ${available}` : 'No knowledge items exist in this workspace.'),
        )
      }

      if (flags.file) {
        const fileParams = new URLSearchParams({path: flags.file})
        const fileUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/knowledge/${item.id}/file?${fileParams.toString()}`

        const fileResponse = await this.verboseFetch(
          fileUrl,
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

        if (!fileResponse.ok) {
          const errorText = await fileResponse.text()
          this.error(
            `Failed to fetch file "${flags.file}" from knowledge item "${item.name}": ${fileResponse.status} ${fileResponse.statusText}\n${errorText}`,
          )
        }

        const fileJson = await fileResponse.json() as {file?: {content?: string}}
        const fileContent = fileJson.file?.content ?? ''

        if (flags.output === 'json') {
          this.log(JSON.stringify({content: fileContent, name: item.name, path: flags.file}, null, 2))
        } else {
          this.log(fileContent)
        }

        return
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(item, null, 2))
      } else {
        this.log(item.content ?? '')
      }
    } catch (error) {
      if (error instanceof Error && 'oclif' in error) throw error
      if (error instanceof Error) {
        this.error(`Failed to fetch knowledge: ${error.message}`)
      } else {
        this.error(`Failed to fetch knowledge: ${String(error)}`)
      }
    }
  }
}
