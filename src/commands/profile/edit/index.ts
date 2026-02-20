import {Args, Flags} from '@oclif/core'
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

export default class ProfileEdit extends BaseCommand {
  static args = {
    name: Args.string({
      description: 'Profile name to edit (uses default profile if not specified)',
      required: false,
    }),
  }
  static description = 'Edit an existing profile configuration'
  static examples = [
    `$ xano profile:edit --access_token new_token123
Profile 'default' updated successfully at ~/.xano/credentials.yaml
`,
    `$ xano profile:edit production --access_token new_token123
Profile 'production' updated successfully at ~/.xano/credentials.yaml
`,
    `$ xano profile:edit staging -i https://new-staging-instance.xano.com -t new_token456
Profile 'staging' updated successfully at ~/.xano/credentials.yaml
`,
    `$ xano profile:edit -b new-branch
Profile 'default' updated successfully at ~/.xano/credentials.yaml
`,
    `$ xano profile:edit --remove-branch
Profile 'default' updated successfully at ~/.xano/credentials.yaml
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    access_token: Flags.string({
      char: 't',
      description: 'Update access token for the Xano Metadata API',
      required: false,
    }),
    account_origin: Flags.string({
      char: 'a',
      description: 'Update account origin URL',
      required: false,
    }),
    branch: Flags.string({
      char: 'b',
      description: 'Update branch name',
      required: false,
    }),
    instance_origin: Flags.string({
      char: 'i',
      description: 'Update instance origin URL',
      required: false,
    }),
    'remove-branch': Flags.boolean({
      default: false,
      description: 'Remove branch from profile',
      required: false,
    }),
    'remove-workspace': Flags.boolean({
      default: false,
      description: 'Remove workspace from profile',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Update workspace name',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfileEdit)

    // Use provided name or default profile
    const profileName = args.name || this.getDefaultProfile()

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
    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}`,
      )
    }

    // Get the existing profile
    const existingProfile = credentials.profiles[profileName]

    // Check if any flags were provided
    const hasFlags =
      flags.account_origin ||
      flags.instance_origin ||
      flags.access_token ||
      flags.workspace ||
      flags.branch ||
      flags['remove-workspace'] ||
      flags['remove-branch']

    if (!hasFlags) {
      this.error('No fields specified to update. Use at least one flag to edit the profile.')
    }

    // Update only the fields that were provided
    const updatedProfile = {
      ...existingProfile,
      ...(flags.account_origin !== undefined && {account_origin: flags.account_origin}),
      ...(flags.instance_origin !== undefined && {instance_origin: flags.instance_origin}),
      ...(flags.access_token !== undefined && {access_token: flags.access_token}),
      ...(flags.workspace !== undefined && {workspace: flags.workspace}),
      ...(flags.branch !== undefined && {branch: flags.branch}),
    }

    // Handle removal flags
    if (flags['remove-workspace']) {
      delete updatedProfile.workspace
    }

    if (flags['remove-branch']) {
      delete updatedProfile.branch
    }

    credentials.profiles[profileName] = updatedProfile

    // Write the updated credentials back to the file
    try {
      const yamlContent = yaml.dump(credentials, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      })

      fs.writeFileSync(credentialsPath, yamlContent, 'utf8')
      this.log(`Profile '${profileName}' updated successfully at ${credentialsPath}`)
    } catch (error) {
      this.error(`Failed to write credentials file: ${error}`)
    }
  }
}
