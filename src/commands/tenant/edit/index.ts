import {Args, Flags} from '@oclif/core'
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

interface Tenant {
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
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
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
      description: 'Enable/disable ingress',
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
      description: 'Enable/disable RBAC',
      required: false,
    }),
    tasks: Flags.boolean({
      allowNo: true,
      description: 'Enable/disable background tasks',
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

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentials()

    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xano profile create'`,
      )
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

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
      // Fetch current tenant state (PUT requires all fields)
      const getResponse = await this.verboseFetch(
        baseUrl,
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

      const current = await getResponse.json() as Tenant

      // Merge in user-provided values
      const body: Record<string, unknown> = {
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

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      this.error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile create'`,
      )
    }

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
