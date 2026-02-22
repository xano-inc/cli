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

interface Release {
  branch?: string
  created_at?: number
  description?: string
  hotfix?: boolean
  id: number
  name: string
  resource_size?: number
}

export default class ReleaseDelete extends BaseCommand {
  static override args = {
    release_name: Args.string({
      description: 'Release name to delete',
      required: true,
    }),
  }
  static description = 'Delete a release permanently. This action cannot be undone.'
  static examples = [
    `$ xano release delete v1.0
Are you sure you want to delete release 'v1.0'? This action cannot be undone. (y/N) y
Deleted release 'v1.0'
`,
    `$ xano release delete v1.0 --force
Deleted release 'v1.0'
`,
    `$ xano release delete v1.0 -f -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skip confirmation prompt',
      required: false,
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
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ReleaseDelete)

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

    const releaseName = args.release_name

    if (!flags.force) {
      const confirmed = await this.confirm(
        `Are you sure you want to delete release '${releaseName}'? This action cannot be undone.`,
      )
      if (!confirmed) {
        this.log('Deletion cancelled.')
        return
      }
    }

    const releaseId = await this.resolveReleaseName(profile, workspaceId, releaseName, flags.verbose)

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release/${releaseId}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
          },
          method: 'DELETE',
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

      if (flags.output === 'json') {
        this.log(JSON.stringify({deleted: true, release_name: releaseName}, null, 2))
      } else {
        this.log(`Deleted release '${releaseName}'`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to delete release: ${error.message}`)
      } else {
        this.error(`Failed to delete release: ${String(error)}`)
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

  private async resolveReleaseName(
    profile: ProfileConfig,
    workspaceId: string,
    releaseName: string,
    verbose: boolean,
  ): Promise<number> {
    const listUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release`

    const response = await this.verboseFetch(
      listUrl,
      {
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      },
      verbose,
      profile.access_token,
    )

    if (!response.ok) {
      const errorText = await response.text()
      this.error(
        `Failed to list releases: ${response.status} ${response.statusText}\n${errorText}`,
      )
    }

    const data = await response.json() as Release[] | {items?: Release[]}
    const releases: Release[] = Array.isArray(data)
      ? data
      : (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items))
        ? data.items
        : []

    const match = releases.find(r => r.name === releaseName)
    if (!match) {
      const available = releases.map(r => r.name).join(', ')
      this.error(
        `Release '${releaseName}' not found.${available ? ` Available releases: ${available}` : ''}`,
      )
    }

    return match.id
  }
}
