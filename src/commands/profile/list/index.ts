import {Command, Flags, ux} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {resolveCredentialsPath} from '../../../base-command.js'

interface ProfileConfig {
  access_token: string
  account_origin: string
  branch?: string
  insecure?: boolean
  instance_origin: string
  name: string
  project?: string
  workspace?: string
}

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: Omit<ProfileConfig, 'name'>
  }
}

export default class ProfileList extends Command {
  static description = 'List all available profile configurations'
  static examples = [
    `$ xano profile:list
Available profiles:
  - default
  - production
  - staging
  - development
`,
    `$ xano profile:list --details
Available profiles:

Profile: default
  Account Origin: https://account.xano.com
  Instance Origin: https://instance.xano.com
  Access Token: ***...***
  Workspace: my-workspace
  Branch: main
  Project: my-project

Profile: production
  Account Origin: https://account.xano.com
  Instance Origin: https://prod-instance.xano.com
  Access Token: ***...***
`,
    `$ xano profile:list -d
Available profiles:

Profile: default
  Account Origin: https://account.xano.com
  Instance Origin: https://instance.xano.com
  Access Token: ***...***
  Workspace: my-workspace
  Branch: main
  Project: my-project
`,
  ]
  static override flags = {
    config: Flags.string({
      char: 'c',
      description: 'Path to credentials file (default: ~/.xano/credentials.yaml)',
      env: 'XANO_CONFIG',
      required: false,
    }),
    details: Flags.boolean({
      char: 'd',
      default: false,
      description: 'Show detailed information for each profile',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfileList)

    const credentialsPath = resolveCredentialsPath(flags.config)

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      this.log(`No profiles found. The credentials file does not exist at ${credentialsPath}`)
      this.log(`Create a profile using 'xano profile:create'`)
      return
    }

    // Read credentials file
    let credentials: CredentialsFile
    try {
      const fileContent = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = yaml.load(fileContent) as CredentialsFile

      if (!parsed || typeof parsed !== 'object' || !('profiles' in parsed)) {
        this.error('Credentials file has invalid format.')
      }

      credentials = parsed
    } catch (error) {
      this.error(`Failed to parse credentials file: ${error}`)
    }

    // Get profile names
    const profileNames = Object.keys(credentials.profiles)

    if (profileNames.length === 0) {
      this.log('No profiles found in credentials file.')
      this.log(`Create a profile using 'xano profile:create'`)
      return
    }

    // Display profiles
    if (flags.details) {
      this.log('Available profiles:\n')

      for (const name of profileNames.sort()) {
        const profile = credentials.profiles[name]
        const isDefault = credentials.default === name ? ` ${ux.colorize('yellow', '[DEFAULT]')}` : ''
        this.log(`Profile: ${name}${isDefault}`)
        this.log(`  Account Origin: ${profile.account_origin || '(not set)'}`)
        this.log(`  Instance Origin: ${profile.instance_origin}`)
        this.log(`  Access Token: ${this.maskToken(profile.access_token)}`)

        if (profile.workspace) {
          this.log(`  Workspace: ${profile.workspace}`)
        }

        if (profile.branch) {
          this.log(`  Branch: ${profile.branch}`)
        }

        if (profile.project) {
          this.log(`  Project: ${profile.project}`)
        }

        if (profile.insecure) {
          this.log(`  Insecure: true`)
        }

        this.log('') // Empty line between profiles
      }
    } else {
      this.log('Available profiles:')
      for (const name of profileNames.sort()) {
        const profile = credentials.profiles[name]
        const isDefault = credentials.default === name ? ` ${ux.colorize('yellow', '[DEFAULT]')}` : ''
        const instance = profile.instance_origin ? ` (${profile.instance_origin.replace(/^https?:\/\//, '')}` : ' ('
        const workspace = profile.workspace ? `, workspace: ${profile.workspace})` : ')'
        this.log(`  - ${name}${isDefault}${instance}${workspace}`)
      }
    }
  }

  private maskToken(token: string): string {
    if (token.length <= 8) {
      return '***'
    }

    const start = token.slice(0, 3)
    const end = token.slice(-3)
    return `${start}...${end}`
  }
}
