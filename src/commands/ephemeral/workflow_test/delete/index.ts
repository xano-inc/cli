import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../../base-command.js'

export default class EphemeralWorkflowTestDelete extends BaseCommand {
  static override args = {
    workflow_test_id: Args.integer({
      description: 'ID of the workflow test to delete',
      required: true,
    }),
  }
  static description = 'Delete a workflow test for an ephemeral tenant'
  static examples = [
    `$ xano ephemeral workflow-test delete 42 -t e1a2-b3c4-x5y6
Deleted workflow test 42
`,
    `$ xano ephemeral workflow-test delete 42 -t e1a2-b3c4-x5y6 -o json`,
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
    const {args, flags} = await this.parse(EphemeralWorkflowTestDelete)

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
          method: 'DELETE',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify({deleted: true, workflow_test_id: args.workflow_test_id}, null, 2))
      } else {
        this.log(`Deleted workflow test ${args.workflow_test_id}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete workflow test: ${error.message}`)
      } else {
        this.error(`Failed to delete workflow test: ${String(error)}`)
      }
    }
  }
}
