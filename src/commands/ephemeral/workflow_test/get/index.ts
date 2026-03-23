import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class EphemeralWorkflowTestGet extends BaseCommand {
  static override args = {
    workflow_test_id: Args.integer({
      description: 'ID of the workflow test',
      required: true,
    }),
  }
  static description = 'Get a workflow test for an ephemeral tenant'
  static examples = [
    `$ xano ephemeral workflow-test get 42 -t e1a2-b3c4-x5y6`,
    `$ xano ephemeral workflow-test get 42 -t e1a2-b3c4-x5y6 -o json`,
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
    tenant: Flags.string({
      char: 't',
      description: 'Ephemeral tenant name',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralWorkflowTestGet)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\nCreate a profile using 'xano profile create'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${encodeURIComponent(flags.tenant)}/workflow_test/${args.workflow_test_id}`

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

      const test = await response.json()

      if (flags.output === 'json') {
        this.log(JSON.stringify(test, null, 2))
      } else {
        const t = test as {description?: string; id: number; name: string}
        this.log(`Workflow Test: ${t.name} (ID: ${t.id})`)
        if (t.description) this.log(`  Description: ${t.description}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to get workflow test: ${error.message}`)
      } else {
        this.error(`Failed to get workflow test: ${String(error)}`)
      }
    }
  }
}
