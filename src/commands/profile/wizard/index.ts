import {ExitPromptError} from '@inquirer/core'
import {Args, Command, Flags} from '@oclif/core'
import inquirer from 'inquirer'
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

interface Instance {
  display: string
  id: string
  name: string
  origin: string
}

interface Workspace {
  id: string
  name: string
}

interface Branch {
  id: string
  label: string
}

export default class ProfileWizard extends Command {
  static description = 'Create a new profile configuration using an interactive wizard'
  static examples = [
    `$ xano profile:wizard
Welcome to the Xano Profile Wizard!
? Enter your access token: ***...***
? Select an instance:
  > Production (https://app.xano.com)
    Staging (https://staging.xano.com)
? Profile name: production
Profile 'production' created successfully at ~/.xano/credentials.yaml
`,
  ]
  static override flags = {
    name: Flags.string({
      char: 'n',
      description: 'Profile name (skip prompt if provided)',
      required: false,
    }),
    origin: Flags.string({
      char: 'o',
      default: 'https://app.xano.com',
      description: 'Xano instance origin URL',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfileWizard)

    this.log('Welcome to the Xano Profile Wizard!')
    this.log('')

    try {
      // Step 1: Get access token
      const {accessToken} = await inquirer.prompt([
        {
          mask: '',
          message: 'Enter your access token',
          name: 'accessToken',
          type: 'password',
          validate(input: string) {
            if (!input || input.trim() === '') {
              return 'Access token cannot be empty'
            }

            return true
          },
        },
      ])

      // Step 2: Fetch instances from API
      this.log('')
      this.log('Fetching available instances...')
      let instances: Instance[] = []

      try {
        instances = await this.fetchInstances(accessToken, flags.origin)
      } catch (error) {
        this.error(`Failed to fetch instances: ${error instanceof Error ? error.message : String(error)}`)
      }

      if (instances.length === 0) {
        this.error('No instances found. Please check your access token.')
      }

      // Step 3: Let user select an instance
      this.log('')
      const {instanceId} = await inquirer.prompt([
        {
          choices: instances.map((inst) => ({
            name: `${inst.name} (${inst.display})`,
            value: inst.id,
          })),
          message: 'Select an instance',
          name: 'instanceId',
          type: 'select',
        },
      ])

      const selectedInstance = instances.find((inst) => inst.id === instanceId)!

      // Step 4: Get profile name
      const defaultProfileName = flags.name || this.getDefaultProfileName()
      const {profileName} = await inquirer.prompt([
        {
          default: defaultProfileName,
          message: 'Profile name',
          name: 'profileName',
          type: 'input',
          validate(input: string) {
            if (!input || input.trim() === '') {
              return 'Profile name cannot be empty'
            }

            return true
          },
        },
      ])

      // Step 5: Workspace selection
      let workspace: string | undefined
      let branch: string | undefined
      // Fetch workspaces from the selected instance
      this.log('')
      this.log('Fetching available workspaces...')
      let workspaces: Workspace[] = []

      try {
        workspaces = await this.fetchWorkspaces(accessToken, selectedInstance.origin)
      } catch (error) {
        this.warn(`Failed to fetch workspaces: ${error instanceof Error ? error.message : String(error)}`)
      }

      // If workspaces were fetched, let user select one
      if (workspaces.length > 0) {
        this.log('')
        const {selectedWorkspace} = await inquirer.prompt([
          {
            choices: [
              {name: '(Skip workspace)', value: ''},
              ...workspaces.map((ws) => ({
                name: ws.name,
                value: ws.id,
              })),
            ],
            message: 'Select a workspace (or skip to use default)',
            name: 'selectedWorkspace',
            type: 'select',
          },
        ])

        workspace = selectedWorkspace || undefined

        // If a workspace was selected, ask about branch preference
        if (workspace) {
          this.log('')

          this.log('')
          this.log('Fetching available branches...')
          let branches: Branch[] = []

          try {
            branches = await this.fetchBranches(accessToken, selectedInstance.origin, workspace)
          } catch (error) {
            this.warn(`Failed to fetch branches: ${error instanceof Error ? error.message : String(error)}`)
          }

          // If branches were fetched, let user select one
          if (branches.length > 0) {
            this.log('')
            const {selectedBranch} = await inquirer.prompt([
              {
                choices: [
                  {name: '(Skip and use live branch)', value: ''},
                  ...branches.map((br) => ({
                    name: br.label,
                    value: br.id,
                  })),
                ],
                message: 'Select a branch',
                name: 'selectedBranch',
                type: 'select',
              },
            ])

            branch = selectedBranch || undefined
          }
        }
      }

      // Save profile
      await this.saveProfile(
        {
          access_token: accessToken,
          account_origin: flags.origin,
          branch,
          instance_origin: selectedInstance.origin,
          name: profileName,
          workspace,
        },
        true,
      )

      this.log('')
      this.log(`✓ Profile '${profileName}' created successfully!`)
    } catch (error) {
      if (error instanceof ExitPromptError) {
        this.log('Wizard cancelled.')
        process.exit(0)
      }

      throw error
    }
  }

  private async fetchBranches(accessToken: string, origin: string, workspaceId: string): Promise<Branch[]> {
    const response = await fetch(`${origin}/api:meta/workspace/${workspaceId}/branch`, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized. Please check your access token.')
      }

      throw new Error(`API request failed with status ${response.status}`)
    }

    const data = (await response.json()) as any

    // Transform API response to Branch format
    // Assuming the API returns an array or object with branches
    if (Array.isArray(data)) {
      return data.map((br: any) => ({
        id: br.id || br.label,
        label: br.label,
      }))
    }

    // If it's an object, try to extract branches
    if (data && typeof data === 'object') {
      const branches = data.branches || data.data || []
      if (Array.isArray(branches)) {
        return branches.map((br: any) => ({
          id: br.id || br.name,
          label: br.label,
        }))
      }
    }

    return []
  }

  private async fetchInstances(accessToken: string, origin: string): Promise<Instance[]> {
    const response = await fetch(`${origin}/api:meta/instance`, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized. Please check your access token.')
      }

      throw new Error(`API request failed with status ${response.status}`)
    }

    const data = (await response.json()) as any

    // Transform API response to Instance format
    // Assuming the API returns an array or object with instances
    if (Array.isArray(data)) {
      return data.map((inst: any) => ({
        display: inst.display,
        id: inst.id || inst.name,
        name: inst.name,
        origin: new URL(inst.meta_api).origin,
      }))
    }

    // If it's an object, try to extract instances
    if (data && typeof data === 'object') {
      const instances = data.instances || data.data || []
      if (Array.isArray(instances)) {
        return instances.map((inst: any) => ({
          display: inst.display,
          id: inst.id || inst.name,
          name: inst.name,
          origin: new URL(inst.meta_api).origin,
        }))
      }
    }

    return []
  }

  private async fetchWorkspaces(accessToken: string, origin: string): Promise<Workspace[]> {
    const response = await fetch(`${origin}/api:meta/workspace`, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized. Please check your access token.')
      }

      throw new Error(`API request failed with status ${response.status}`)
    }

    const data = (await response.json()) as any

    // Transform API response to Workspace format
    // Assuming the API returns an array or object with workspaces
    if (Array.isArray(data)) {
      return data.map((ws: any) => ({
        id: ws.id || ws.name,
        name: ws.name,
      }))
    }

    // If it's an object, try to extract workspaces
    if (data && typeof data === 'object') {
      const workspaces = data.workspaces || data.data || []
      if (Array.isArray(workspaces)) {
        return workspaces.map((ws: any) => ({
          id: ws.id || ws.name,
          name: ws.name,
        }))
      }
    }

    return []
  }

  private getDefaultProfileName(): string {
    try {
      const configDir = path.join(os.homedir(), '.xano')
      const credentialsPath = path.join(configDir, 'credentials.yaml')

      if (!fs.existsSync(credentialsPath)) {
        return 'default'
      }

      const fileContent = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = yaml.load(fileContent) as CredentialsFile

      if (parsed && typeof parsed === 'object' && 'default' in parsed && parsed.default) {
        return parsed.default
      }

      return 'default'
    } catch {
      return 'default'
    }
  }

  private async saveProfile(profile: ProfileConfig, setAsDefault: boolean = false): Promise<void> {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    // Ensure the .xano directory exists
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, {recursive: true})
    }

    // Read existing credentials file or create new structure
    let credentials: CredentialsFile = {profiles: {}}

    if (fs.existsSync(credentialsPath)) {
      try {
        const fileContent = fs.readFileSync(credentialsPath, 'utf8')
        const parsed = yaml.load(fileContent) as CredentialsFile

        if (parsed && typeof parsed === 'object' && 'profiles' in parsed) {
          credentials = parsed
        }
      } catch {
        // Continue with empty credentials if parse fails
      }
    }

    // Add or update the profile
    credentials.profiles[profile.name] = {
      access_token: profile.access_token,
      account_origin: profile.account_origin,
      instance_origin: profile.instance_origin,
      ...(profile.workspace && {workspace: profile.workspace}),
      ...(profile.branch && {branch: profile.branch}),
    }

    // Set as default if requested
    if (setAsDefault) {
      credentials.default = profile.name
    }

    // Write the updated credentials back to the file
    const yamlContent = yaml.dump(credentials, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    })

    fs.writeFileSync(credentialsPath, yamlContent, 'utf8')
  }
}
