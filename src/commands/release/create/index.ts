import {Flags} from '@oclif/core'
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

export default class ReleaseCreate extends BaseCommand {
  static description = 'Create a new release in a workspace'
  static examples = [
    `$ xano release create --name "v1.0" --branch main
Created release: v1.0 - ID: 10
`,
    `$ xano release create --name "v1.1-hotfix" --branch main --hotfix --description "Critical fix" -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch to create the release from',
      required: true,
    }),
    description: Flags.string({
      char: 'd',
      description: 'Release description',
      required: false,
    }),
    hotfix: Flags.boolean({
      default: false,
      description: 'Mark as a hotfix release',
      required: false,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Name for the release',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    'table-ids': Flags.string({
      description: 'Comma-separated table IDs to include',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (uses profile workspace if not provided)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ReleaseCreate)

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

    const body: Record<string, unknown> = {
      branch: flags.branch,
      hotfix: flags.hotfix,
      name: flags.name,
    }

    if (flags.description) body.description = flags.description
    if (flags['table-ids']) {
      body.table_ids = flags['table-ids'].split(',').map(id => Number.parseInt(id.trim(), 10))
    }

    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
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
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const release = await response.json() as Release

      if (flags.output === 'json') {
        this.log(JSON.stringify(release, null, 2))
      } else {
        this.log(`Created release: ${release.name} - ID: ${release.id}`)
        if (release.branch) this.log(`  Branch: ${release.branch}`)
        if (release.hotfix) this.log(`  Hotfix: true`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to create release: ${error.message}`)
      } else {
        this.error(`Failed to create release: ${String(error)}`)
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
