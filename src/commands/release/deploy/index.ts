import {Args, Flags} from '@oclif/core'

import BaseCommand from '../../../base-command.js'

interface Release {
  branch?: string
  created_at?: number | string
  description?: string
  id: number
  name: string
}

export default class ReleaseDeploy extends BaseCommand {
  static override args = {
    release_name: Args.string({
      description: 'Name of the release to deploy',
      required: true,
    }),
  }
  static description =
    '[IMPORTANT] ALWAYS confirm with the user before deploying a release. Deploys a release to its workspace as a new branch.'
  static examples = [
    `$ xano release deploy "v1.0"
Are you sure you want to deploy release "v1.0"? (y/N) y
Deployed release "v1.0" to workspace 40 (branch: v1.0, set live)
`,
    `$ xano release deploy "v1.0" --force
Deployed release "v1.0" to workspace 40 (branch: v1.0)
`,
    `$ xano release deploy "v1.0" --branch "restore-v1" --no-set_live`,
    `$ xano release deploy "v1.0" -w 40 -o json --force`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch label for the new branch (defaults to release branch name)',
      required: false,
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: '[IMPORTANT] NEVER run without explicit user confirmation. Skips the confirmation prompt.',
      required: false,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    set_live: Flags.boolean({
      default: false,
      description: '[CRITICAL] STOP and confirm with the user before setting the deployed branch as live.',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ReleaseDeploy)

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

    const workspaceId = flags.workspace || profile.workspace
    if (!workspaceId) {
      this.error('No workspace ID provided. Use --workspace flag or set one in your profile.')
    }

    const releaseName = encodeURIComponent(args.release_name)
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release/${releaseName}/deploy`

    const body: Record<string, unknown> = {
      set_live: flags.set_live,
    }

    if (flags.branch) body.branch = flags.branch

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to deploy release "${args.release_name}" to workspace ${workspaceId}?`
      )
      if (!confirmed) {
        this.log('Deploy cancelled.')
        return
      }
    }

    this.warn('This may take a few minutes. Please be patient.')

    const startTime = Date.now()

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
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

      const release = (await response.json()) as Release

      if (flags.output === 'json') {
        this.log(JSON.stringify(release, null, 2))
      } else {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        const branchLabel = flags.branch || release.branch || 'default'
        const liveStatus = flags.set_live ? ', set live' : ''
        this.log(`Deployed release "${release.name}" to workspace ${workspaceId} (branch: ${branchLabel}${liveStatus})`)
        if (release.description) this.log(`  Description: ${release.description}`)
        this.log(`  Time: ${elapsed}s`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to deploy release: ${error.message}`)
      } else {
        this.error(`Failed to deploy release: ${String(error)}`)
      }
    }
  }

  private async confirm(message: string): Promise<boolean> {
    const readline = await import('node:readline')
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise((resolve) => {
      rl.question(`${message} (y/N) `, (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      })
    })
  }
}
