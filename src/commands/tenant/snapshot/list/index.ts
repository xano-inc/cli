import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

interface Snapshot {
  created?: string
  description?: string
  is_live?: boolean
  is_original?: boolean
  name: string
  size_bytes?: number
  size_pretty?: string
}

export default class TenantSnapshotList extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to list snapshots for',
      required: true,
    }),
  }
  static description = 'List database snapshots for a tenant'
  static examples = [
    `$ xano tenant snapshot list t1234-abcd-xyz1
Snapshots for tenant t1234-abcd-xyz1:
  - t1234-abcd-xyz1 (25 MB) [ORIGINAL]
  - t1234-abcd-xyz1_bk_20260603_203614 (25 MB, 2026-06-03 20:36:14) [LIVE]
`,
    `$ xano tenant snapshot list t1234-abcd-xyz1 -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantSnapshotList)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const tenantName = args.tenant_name
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/snapshot`

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
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const data = (await response.json()) as Snapshot[] | {items?: Snapshot[]}

      let snapshots: Snapshot[]
      if (Array.isArray(data)) {
        snapshots = data
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        snapshots = data.items
      } else {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(snapshots, null, 2))
      } else if (snapshots.length === 0) {
        this.log(`No snapshots found for tenant ${tenantName}`)
      } else {
        this.log(`Snapshots for tenant ${tenantName}:`)
        for (const snapshot of snapshots) {
          const size = snapshot.size_pretty || (snapshot.size_bytes ? `${snapshot.size_bytes} bytes` : 'unknown')
          const meta = snapshot.created ? `${size}, ${snapshot.created}` : size
          const tags: string[] = []
          if (snapshot.is_original) tags.push('ORIGINAL')
          if (snapshot.is_live) tags.push('LIVE')
          const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : ''
          this.log(`  - ${snapshot.name} (${meta})${tagStr}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list snapshots: ${error.message}`)
      } else {
        this.error(`Failed to list snapshots: ${String(error)}`)
      }
    }
  }
}
