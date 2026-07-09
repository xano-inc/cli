import {Flags} from '@oclif/core'

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
  scope?: string
}

interface KnowledgeListResponse {
  items: KnowledgeItem[]
}

export default class KnowledgeList extends BaseCommand {
  static override args = {}
  static override description = 'List workspace knowledge and skills as plain-text markdown'
  static override examples = [
    `$ xano knowledge list -w 40
# Always-on Knowledge

## deploy-runbook

# Deploy Runbook
...

# On-demand Knowledge

- **code-style**: Our team coding conventions
`,
    '$ xano knowledge list -w 40 --output json',
    '$ xano knowledge list -w 40 --type skill',
    '$ xano knowledge list --no-enabled-only',
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch ID',
      required: false,
    }),
    'enabled-only': Flags.boolean({
      allowNo: true,
      default: true,
      description: 'Only show enabled knowledge (use --no-enabled-only to include disabled)',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'markdown',
      description: 'Output format',
      options: ['markdown', 'json'],
      required: false,
    }),
    type: Flags.string({
      char: 't',
      description: 'Filter by knowledge type',
      options: ['skill', 'doc', 'agents.md'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(KnowledgeList)
    const {profile, profileName} = this.resolveProfile(flags)

    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano knowledge list -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    const queryParams = new URLSearchParams()
    queryParams.set('enabled_only', flags['enabled-only'].toString())
    queryParams.set('include_content', 'true')

    if (flags.branch) {
      queryParams.set('branch_id', flags.branch)
    }

    if (flags.type) {
      queryParams.set('type', flags.type)
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/knowledge?${queryParams.toString()}`

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

      const data = await response.json() as KnowledgeListResponse
      const items: KnowledgeItem[] = Array.isArray(data) ? data : (data.items ?? [])

      if (flags.output === 'json') {
        this.log(JSON.stringify(items, null, 2))
        return
      }

      this.log(this.formatMarkdown(items))
    } catch (error) {
      if (error instanceof Error && 'oclif' in error) throw error
      if (error instanceof Error) {
        this.error(`Failed to fetch knowledge: ${error.message}`)
      } else {
        this.error(`Failed to fetch knowledge: ${String(error)}`)
      }
    }
  }

  private formatMarkdown(items: KnowledgeItem[]): string {
    if (items.length === 0) {
      return 'No knowledge items found.'
    }

    const alwaysOn = items.filter((item) => item.mode === 'always')
    const onDemand = items.filter((item) => item.mode !== 'always')
    const lines: string[] = []

    if (alwaysOn.length > 0) {
      lines.push('# Always-on Knowledge')
      for (const item of alwaysOn) {
        lines.push('', `## ${item.name ?? '(unnamed)'}`, '', item.content ?? '', '', '---')
      }
    }

    if (onDemand.length > 0) {
      if (lines.length > 0) lines.push('')
      lines.push('# On-demand Knowledge', '')
      for (const item of onDemand) {
        const desc = item.description || '(no description)'
        lines.push(`- **${item.name ?? '(unnamed)'}**: ${desc}`)
      }
    }

    return lines.join('\n')
  }
}
