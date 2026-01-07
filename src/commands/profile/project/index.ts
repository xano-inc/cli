import {Command} from '@oclif/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'

interface ProfileConfig {
  account_origin?: string
  instance_origin: string
  access_token: string
  workspace?: string
  branch?: string
  project?: string
}

interface CredentialsFile {
  profiles: {
    [key: string]: ProfileConfig
  }
  default?: string
}

export default class ProfileProject extends Command {
  static description = 'Print the project for the default profile'

  static examples = [
    `$ xano profile:project
my-project-id
`,
    `$ xano profile:project | pbcopy
# Copies the project to clipboard on macOS
`,
  ]

  async run(): Promise<void> {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      this.error(`Credentials file not found at ${credentialsPath}. Create a profile first using 'profile:create'.`)
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

    // Get the default profile name
    const defaultProfileName = credentials.default
    if (!defaultProfileName) {
      this.error("No default profile set. Set one using 'profile:set-default <name>'.")
    }

    // Check if the default profile exists
    if (!(defaultProfileName in credentials.profiles)) {
      this.error(`Default profile '${defaultProfileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}`)
    }

    const profile = credentials.profiles[defaultProfileName]

    // Get and display the project
    if (profile.project) {
      this.log(profile.project)
    } else {
      this.error(`Profile '${defaultProfileName}' does not have a project set. Set one using 'profile:edit -j <project>'.`)
    }
  }
}
