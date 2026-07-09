import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface DeployResponse {
  [key: string]: any
  custom_url?: string
  default_url?: string
}

export default class StaticHostDeploy extends BaseCommand {
  static args = {
    static_host: Args.string({
      description: 'Static Host name',
      required: true,
    }),
  }
  static description = 'Deploy a static host build to an environment'
  static examples = [
    `$ xano static_host deploy default --build_id 52 --env dev
Deployed build 52 to dev
URL: https://x1234-abcd.static.xano.io
`,
    `$ xano static_host deploy default --build_id 52 --env prod
Deployed build 52 to prod
URL: https://x1234-abcd.static.xano.io
`,
    `$ xano static_host deploy myhost --build_id 123 --env dev -w 40
Deployed build 123 to dev
`,
    `$ xano static_host deploy default --build_id 52 --env prod -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    build_id: Flags.string({
      description: 'Build ID to deploy',
      required: true,
    }),
    env: Flags.string({
      description: 'Target environment',
      options: ['dev', 'prod'],
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(StaticHostDeploy)

    const {profile, profileName} = this.resolveProfile(flags)

    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano static_host deploy <static_host> --build_id <id> --env <env> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile edit ${profileName} -w <workspace_id>`,
      )
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/static_host/${args.static_host}/build/${flags.build_id}/env`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify({env: flags.env}),
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
      }

      const result = await response.json() as DeployResponse

      if (!result || typeof result !== 'object') {
        this.error('Unexpected API response format')
      }

      if (flags.output === 'json') {
        this.log(JSON.stringify(result, null, 2))
      } else {
        this.log(`Deployed build ${flags.build_id} to ${flags.env}`)

        if (result.default_url) {
          this.log(`URL: ${result.default_url}`)
        }

        if (result.custom_url) {
          this.log(`Custom URL: ${result.custom_url}`)
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to deploy build: ${error.message}`)
      } else {
        this.error(`Failed to deploy build: ${String(error)}`)
      }
    }
  }
}
