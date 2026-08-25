import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Tenant {
  deploy_settings?: {
    allow_deploy_bypass?: boolean
    allow_quick_deploy?: boolean
    required_reviewers?: number
  }
  description?: string
  display?: string
  domain?: string
  id: number
  ingress?: boolean
  name: string
  proxy?: string
  rbac?: {enabled?: boolean}
  tag?: Array<{tag: string}>
  tasks?: boolean
}

export default class TenantEdit extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Tenant name to edit',
      required: true,
    }),
  }
  static description = 'Edit an existing tenant'
  static examples = [
    `$ xano tenant edit t1234-abcd-xyz1 --display "New Name" --description "Updated description"
Updated tenant: New Name (my-tenant) - ID: 42
`,
    `$ xano tenant edit t1234-abcd-xyz1 --no-tasks --no-ingress -o json`,
    `$ xano tenant edit t1234-abcd-xyz1 --required_reviewers 1`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    allow_quick_deploy: Flags.boolean({
      allowNo: true,
      description:
        'Allow this tenant to skip the deploy approval gate entirely for quick deploys, regardless of --required_reviewers.',
      required: false,
    }),
    description: Flags.string({
      char: 'd',
      description: 'New description',
      required: false,
    }),
    display: Flags.string({
      description: 'New display name',
      required: false,
    }),
    domain: Flags.string({
      description: 'Custom domain',
      required: false,
    }),
    ingress: Flags.boolean({
      allowNo: true,
      description:
        '[IMPORTANT] ALWAYS confirm with the user before disabling ingress; this takes the tenant offline from the public network. Enables/disables ingress.',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    proxy: Flags.string({
      description: 'Proxy URL',
      required: false,
    }),
    rbac: Flags.boolean({
      allowNo: true,
      description:
        '[CRITICAL] NEVER disable RBAC without explicit user confirmation; this removes role-based access controls on the tenant. Enables/disables RBAC.',
      required: false,
    }),
    required_reviewers: Flags.integer({
      description:
        'When greater than 0, that many distinct reviewers must approve a tenant_deploy_request before a release may be deployed to this tenant. 0 means not gated.',
      required: false,
    }),
    tasks: Flags.boolean({
      allowNo: true,
      description:
        '[IMPORTANT] ALWAYS confirm with the user before disabling background tasks; this stops scheduled jobs on the tenant. Enables/disables background tasks.',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantEdit)

    const {profile} = this.resolveProfile(flags)

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error(
        'No workspace ID provided. Use --workspace flag or set one in your profile.',
      )
    }

    const tenantName = args.tenant_name
    const baseUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}`
    const headers = {
      'accept': 'application/json',
      'Authorization': `Bearer ${profile.access_token}`,
      'Content-Type': 'application/json',
    }

    try {
      // Fetch current tenant state (PUT requires all fields). Deliberately uses
      // `tenant list` rather than `tenant get`: the single-tenant GET route's
      // output whitelist (tenant-detail.yaml) omits `deploy_settings` (which
      // holds `required_reviewers`, `allow_deploy_bypass`, and
      // `allow_quick_deploy`) even though the list route's output includes it
      // — confirmed live against a running instance. Using GET here would
      // silently reset those fields to their defaults on every edit that doesn't
      // explicitly pass them. Filed as a backend bug; this is the workaround
      // until it's fixed. See TENANT_DEPLOY_REQUEST_TEST.md.
      const listParams = new URLSearchParams({per_page: '100'})
      const getResponse = await this.verboseFetch(
        `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant?${listParams}`,
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

      if (!getResponse.ok) {
        const errorText = await getResponse.text()
        this.error(
          `Failed to fetch tenant: ${getResponse.status} ${getResponse.statusText}\n${errorText}`,
        )
      }

      const listData = (await getResponse.json()) as Tenant[] | {items?: Tenant[]}
      const listItems = Array.isArray(listData) ? listData : (listData.items ?? [])
      const current = listItems.find((item) => item.name === tenantName)
      if (!current) {
        this.error(`Tenant "${tenantName}" not found`)
      }

      // Merge in user-provided values. allow_deploy_bypass has no edit flag (it's
      // fixed at `tenant create` time), but the PUT still requires the full body,
      // so its current value is preserved here rather than reset.
      const body: Record<string, unknown> = {
        deploy_settings: {
          allow_deploy_bypass: current.deploy_settings?.allow_deploy_bypass ?? false,
          allow_quick_deploy:
            flags.allow_quick_deploy !== undefined
              ? flags.allow_quick_deploy
              : (current.deploy_settings?.allow_quick_deploy ?? false),
          required_reviewers:
            flags.required_reviewers !== undefined
              ? flags.required_reviewers
              : (current.deploy_settings?.required_reviewers ?? 0),
        },
        description: flags.description !== undefined ? flags.description : (current.description ?? ''),
        display: flags.display !== undefined ? flags.display : (current.display ?? current.name),
        domain: flags.domain !== undefined ? flags.domain : (current.domain ?? ''),
        ingress: flags.ingress !== undefined ? flags.ingress : (current.ingress ?? true),
        proxy: flags.proxy !== undefined ? flags.proxy : (current.proxy ?? ''),
        rbac: {
          enabled: flags.rbac !== undefined ? flags.rbac : (current.rbac?.enabled ?? false),
        },
        tag: current.tag ?? [],
        tasks: flags.tasks !== undefined ? flags.tasks : (current.tasks ?? true),
      }

      // Update tenant
      const putResponse = await this.verboseFetch(
        baseUrl,
        {
          body: JSON.stringify(body),
          headers,
          method: 'PUT',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!putResponse.ok) {
        const errorText = await putResponse.text()
        this.error(
          `API request failed with status ${putResponse.status}: ${putResponse.statusText}\n${errorText}`,
        )
      }

      const tenant = await putResponse.json() as Tenant

      if (flags.output === 'json') {
        this.log(JSON.stringify(tenant, null, 2))
      } else {
        this.log(`Updated tenant: ${tenant.display || tenant.name} (${tenant.name}) - ID: ${tenant.id}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to edit tenant: ${error.message}`)
      } else {
        this.error(`Failed to edit tenant: ${String(error)}`)
      }
    }
  }

}
