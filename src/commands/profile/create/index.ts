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
  project?: string
  run_base_url?: string
  workspace?: string
}

interface CredentialsFile {
  default?: string
  profiles: {
    [key: string]: Omit<ProfileConfig, 'name'>
  }
}

export default class ProfileCreate extends Command {
  static args = {
    name: Args.string({
      description: 'Profile name',
      required: true,
    }),
  }
static description = 'Create a new profile configuration'
static examples = [
    `$ xano profile:create production --account_origin https://account.xano.com --instance_origin https://instance.xano.com --access_token token123
Profile 'production' created successfully at ~/.xano/credentials.yaml
`,
    `$ xano profile:create staging -a https://staging-account.xano.com -i https://staging-instance.xano.com -t token456
Profile 'staging' created successfully at ~/.xano/credentials.yaml
`,
    `$ xano profile:create dev -i https://dev-instance.xano.com -t token789 -w my-workspace -b feature-branch
Profile 'dev' created successfully at ~/.xano/credentials.yaml
`,
    `$ xano profile:create dev -i https://dev-instance.xano.com -t token789 -w my-workspace -b feature-branch -j my-project
Profile 'dev' created successfully at ~/.xano/credentials.yaml
`,
    `$ xano profile:create production --account_origin https://account.xano.com --instance_origin https://instance.xano.com --access_token token123 --default
Profile 'production' created successfully at ~/.xano/credentials.yaml
Default profile set to 'production'
`,
  ]
static override flags = {
    access_token: Flags.string({
      char: 't',
      description: 'Access token for the Xano Metadata API',
      required: true,
    }),
    account_origin: Flags.string({
      char: 'a',
      description: 'Account origin URL. Optional for self hosted installs.',
      required: false,
    }),
    branch: Flags.string({
      char: 'b',
      description: 'Branch name',
      required: false,
    }),
    default: Flags.boolean({
      default: false,
      description: 'Set this profile as the default',
      required: false,
    }),
    instance_origin: Flags.string({
      char: 'i',
      description: 'Instance origin URL',
      required: true,
    }),
    project: Flags.string({
      char: 'j',
      description: 'Project name',
      required: false,
    }),
    run_base_url: Flags.string({
      char: 'r',
      description: 'Xano Run API base URL (default: https://app.xano.com/)',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace name',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ProfileCreate)

    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    // Ensure the .xano directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, {recursive: true})
      this.log(`Created directory: ${configDir}`)
    }

    // Read existing credentials file or create new structure
    let credentials: CredentialsFile = {profiles: {}}

    if (fs.existsSync(credentialsPath)) {
      try {
        const fileContent = fs.readFileSync(credentialsPath, 'utf8')
        const parsed = yaml.load(fileContent) as CredentialsFile

        if (parsed && typeof parsed === 'object' && 'profiles' in parsed) {
          credentials = parsed
        } else {
          this.warn('Existing credentials file has invalid format. Creating new structure.')
        }
      } catch (error) {
        this.warn(`Failed to parse existing credentials file: ${error}`)
        this.warn('Creating new credentials file.')
      }
    }

    // Add or update the profile
    const profileExists = args.name in credentials.profiles

    credentials.profiles[args.name] = {
      access_token: flags.access_token,
      account_origin: flags.account_origin ?? '',
      instance_origin: flags.instance_origin,
      ...(flags.workspace && {workspace: flags.workspace}),
      ...(flags.branch && {branch: flags.branch}),
      ...(flags.project && {project: flags.project}),
      ...(flags.run_base_url && {run_base_url: flags.run_base_url}),
    }

    // Set default if flag is provided
    if (flags.default) {
      credentials.default = args.name
    }

    // Write the updated credentials back to the file
    try {
      const yamlContent = yaml.dump(credentials, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      })

      fs.writeFileSync(credentialsPath, yamlContent, 'utf8')

      if (profileExists) {
        this.log(`Profile '${args.name}' updated successfully at ${credentialsPath}`)
      } else {
        this.log(`Profile '${args.name}' created successfully at ${credentialsPath}`)
      }

      if (flags.default) {
        this.log(`Default profile set to '${args.name}'`)
      }
    } catch (error) {
      this.error(`Failed to write credentials file: ${error}`)
    }
  }
}
