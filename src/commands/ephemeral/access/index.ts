import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

export default class EphemeralAccess extends BaseCommand {
  static override args = {
    tenant_name: Args.string({
      description: 'Ephemeral tenant name',
      required: true,
    }),
    access: Args.string({
      description: 'Access level to set',
      options: ['private', 'shared'],
      required: true,
    }),
  }
  static description = 'Change the access level of an ephemeral tenant'
  static examples = [
    `$ xano ephemeral access e1a2-b3c4-x5y6 shared
Access updated to shared for tenant e1a2-b3c4-x5y6
`,
    `$ xano ephemeral access e1a2-b3c4-x5y6 private`,
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
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralAccess)

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

    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${encodeURIComponent(args.tenant_name)}/access`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({access: args.access}),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'PATCH',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const tenant = await response.json()

      if (flags.output === 'json') {
        this.log(JSON.stringify(tenant, null, 2))
      } else {
        this.log(`Access updated to ${args.access} for tenant ${args.tenant_name}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to update access: ${error.message}`)
      } else {
        this.error(`Failed to update access: ${String(error)}`)
      }
    }
  }
}
