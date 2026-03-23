import {Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Tenant {
  display?: string
  ephemeral_access?: string
  id: number
  name: string
  state?: string
}

interface TenantListResponse {
  curPage?: number
  items?: Tenant[]
  nextPage?: number | null
  prevPage?: number | null
}

export default class EphemeralList extends BaseCommand {
  static description = 'List ephemeral tenants'
  static examples = [
    `$ xano ephemeral list
Ephemeral tenants:
  - My Tenant (my-tenant) [ok]
  - CI Tenant (ci-tenant) [ok]
`,
    `$ xano ephemeral list -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    order: Flags.string({
      default: 'asc',
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
      description: 'Page number',
      required: false,
    }),
    per_page: Flags.integer({
      default: 50,
      description: 'Items per page',
      required: false,
    }),
    sort: Flags.string({
      default: 'name',
      description: 'Sort field',
      options: ['name', 'created_at', 'state'],
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(EphemeralList)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\n` + `Create a profile using 'xano profile create'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const params = new URLSearchParams({
      order: flags.order!,
      page: String(flags.page),
      per_page: String(flags.per_page),
      sort: flags.sort!,
    })

    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant?${params}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
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

      const data = (await response.json()) as TenantListResponse

      const tenants = data.items ?? []

      if (flags.output === 'json') {
        this.log(JSON.stringify(data, null, 2))
      } else {
        if (tenants.length === 0) {
          this.log('No ephemeral tenants found')
        } else {
          this.log('Ephemeral tenants:')
          for (const tenant of tenants) {
            const state = tenant.state ? ` [${tenant.state}]` : ''
            const access = tenant.ephemeral_access ? ` [${tenant.ephemeral_access}]` : ''
            this.log(`  - ${tenant.display || tenant.name} (${tenant.name})${state}${access}`)
          }

          if (data.nextPage) {
            this.log(`\nPage ${data.curPage} — more results available (use --page ${data.nextPage})`)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to list ephemeral tenants: ${error.message}`)
      } else {
        this.error(`Failed to list ephemeral tenants: ${String(error)}`)
      }
    }
  }
}
