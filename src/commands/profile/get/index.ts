import {Command, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {resolveCredentialsPath} from '../../../base-command.js'

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: unknown
  }
}

export default class ProfileGet extends Command {
  static description = 'Get the current default profile name'
  static examples = [
    `$ xano profile get
production
`,
  ]
  static override flags = {
    config: Flags.string({
      char: 'c',
      description: 'Path to credentials file (default: ~/.xano/credentials.yaml)',
      env: 'XANO_CONFIG',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfileGet)

    const credentialsPath = resolveCredentialsPath(flags.config)

    if (!fs.existsSync(credentialsPath)) {
      this.error(`Credentials file not found at ${credentialsPath}. No profiles exist.`)
    }

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

    if (credentials.default) {
      this.log(credentials.default)
    } else {
      this.log('No default profile set')
    }
  }
}
