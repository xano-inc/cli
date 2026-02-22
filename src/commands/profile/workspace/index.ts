import {Command} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

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

export default class ProfileWorkspace extends Command {
  static description = 'Print the workspace ID for the default profile'
  static examples = [
    `$ xano profile:workspace
abc123-workspace-id
`,
    `$ xano profile:workspace | pbcopy
# Copies the workspace ID to clipboard on macOS
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

    // Get and display the workspace ID
    if (profile.workspace) {
      this.log(profile.workspace)
    } else {
      this.error(`Profile '${defaultProfileName}' does not have a workspace set. Set one using 'profile:edit ${defaultProfileName} -w <workspace_id>'.`)
    }
  }
}
