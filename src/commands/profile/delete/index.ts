import {Args, Command, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../base-command.js'

interface ProfileConfig {
  access_token: string
  account_origin: string
  branch?: string
  instance_origin: string
  name: string
  workspace?: string
}

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: Omit<ProfileConfig, 'name'>
  }
}

export default class ProfileDelete extends Command {
  static args = {
    name: Args.string({
      description: 'Profile name to delete',
      required: true,
    }),
  }
static description = 'Delete a profile configuration'
static examples = [
    `$ xano profile:delete old-profile
Are you sure you want to delete profile 'old-profile'? (y/n): y
Profile 'old-profile' deleted successfully from ~/.xano/credentials.yaml
`,
    `$ xano profile:delete old-profile --force
Profile 'old-profile' deleted successfully from ~/.xano/credentials.yaml
`,
    `$ xano profile:delete old-profile -f
Profile 'old-profile' deleted successfully from ~/.xano/credentials.yaml
`,
  ]
static override flags = {
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Skip confirmation prompt',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfileDelete)

    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      this.error(`Credentials file not found at ${credentialsPath}. No profiles to delete.`)
    }

    // Read existing credentials file
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

    // Check if profile exists
    if (!(args.name in credentials.profiles)) {
      this.error(`Profile '${args.name}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}`)
    }

    // Confirm deletion unless --force flag is used
    if (!flags.force) {
      const confirm = await this.confirm(`Are you sure you want to delete profile '${args.name}'?`)
      if (!confirm) {
        this.log('Deletion cancelled.')
        return
      }
    }

    // Check if deleting the default profile
    const wasDefault = credentials.default === args.name

    // Delete the profile
    delete credentials.profiles[args.name]

    // If deleted profile was the default, update to first available profile
    if (wasDefault) {
      const remainingProfiles = Object.keys(credentials.profiles)
      if (remainingProfiles.length > 0) {
        credentials.default = remainingProfiles[0]
      } else {
        delete credentials.default
      }
    }

    // Write the updated credentials back to the file
    try {
      const yamlContent = yaml.dump(credentials, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      })

      fs.writeFileSync(credentialsPath, yamlContent, 'utf8')
      this.log(`Profile '${args.name}' deleted successfully from ${credentialsPath}`)

      if (wasDefault) {
        if (credentials.default) {
          this.log(`Default profile changed to '${credentials.default}'`)
        } else {
          this.log(`Default profile removed (no profiles remaining)`)
        }
      }
    } catch (error) {
      this.error(`Failed to write credentials file: ${error}`)
    }
  }

  private async confirm(message: string): Promise<boolean> {
    // Simple confirmation using stdin
    const response = await this.promptInput(`${message} (y/n): `)
    return response.toLowerCase() === 'y' || response.toLowerCase() === 'yes'
  }

  private async promptInput(prompt: string): Promise<string> {
    process.stdout.write(prompt)

    // Set stdin to raw mode temporarily
    const wasRaw = process.stdin.isRaw
    process.stdin.setRawMode?.(false)
    process.stdin.resume()

    return new Promise((resolve) => {
      process.stdin.once('data', (data) => {
        process.stdin.pause()
        if (wasRaw !== undefined) {
          process.stdin.setRawMode?.(wasRaw)
        }

        resolve(data.toString().trim())
      })
    })
  }
}
