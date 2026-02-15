import {Args, Command} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

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

export default class ProfileSetDefault extends Command {
  static args = {
    name: Args.string({
      description: 'Profile name to set as default',
      required: true,
    }),
  }
static description = 'Set the default profile'
static examples = [
    `$ xano profile:set-default production
Default profile set to 'production'
`,
    `$ xano profile:set-default staging
Default profile set to 'staging'
`,
  ]

  async run(): Promise<void> {
    const {args} = await this.parse(ProfileSetDefault)

    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      this.error(`Credentials file not found at ${credentialsPath}. Create a profile first using 'profile:create'.`)
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

    // Set the default profile
    credentials.default = args.name

    // Write the updated credentials back to the file
    try {
      const yamlContent = yaml.dump(credentials, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      })

      fs.writeFileSync(credentialsPath, yamlContent, 'utf8')
      this.log(`Default profile set to '${args.name}'`)
    } catch (error) {
      this.error(`Failed to write credentials file: ${error}`)
    }
  }
}
