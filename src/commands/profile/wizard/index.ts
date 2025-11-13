import {Args, Command, Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as yaml from 'js-yaml'
import inquirer from 'inquirer'

interface ProfileConfig {
  name: string
  account_origin: string
  instance_origin: string
  access_token: string
  workspace?: string
  branch?: string
}

interface CredentialsFile {
  profiles: {
    [key: string]: Omit<ProfileConfig, 'name'>
  }
}

interface Instance {
  id: string
  name: string
  display: string
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
  static override flags = {
    name: Flags.string({
      char: 'n',
      description: 'Profile name (skip prompt if provided)',
      required: false,
    }),
    origin: Flags.string({
      char: 'o',
      description: 'Xano instance origin URL',
      required: false,
      default: 'https://app.xano.com',
    }),
  }

  static description = 'Create a new profile configuration using an interactive wizard'

  static examples = [
    `$ xscli profile:wizard
Welcome to the Xano Profile Wizard!
? Enter your access token: ***...***
? Select an instance:
  > Production (https://app.xano.com)
    Staging (https://staging.xano.com)
? Profile name: production
Profile 'production' created successfully at ~/.xano/credentials.yaml
`,
  ]

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfileWizard)

    this.log('Welcome to the Xano Profile Wizard!')
    this.log('')

    try {
      // Step 1: Get access token
      const {accessToken} = await inquirer.prompt([
        {
          type: 'password',
          name: 'accessToken',
          message: 'Enter your access token',
          mask: '',
          validate: (input: string) => {
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
          type: 'list',
          name: 'instanceId',
          message: 'Select an instance',
          choices: instances.map((inst) => ({
            name: `${inst.name} (${inst.display})`,
            value: inst.id,
          })),
        },
      ])

      const selectedInstance = instances.find((inst) => inst.id === instanceId)!

      // Step 4: Get profile name
      const {profileName} = await inquirer.prompt([
        {
          type: 'input',
          name: 'profileName',
          message: 'Profile name',
          default: flags.name || 'default',
          validate: (input: string) => {
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
            type: 'list',
            name: 'selectedWorkspace',
            message: 'Select a workspace (or skip to use default)',
            choices: [
              {name: '(Skip workspace)', value: ''},
              ...workspaces.map(ws => ({
                name: ws.name,
                value: ws.id,
              })),
            ],
          },
        ])

        workspace = selectedWorkspace || undefined

        // If a workspace was selected, ask about branch preference
        if (workspace) {
          this.log('')
          const {useLiveBranch} = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'useLiveBranch',
              message: 'Use the live branch (recommended)?',
              default: true,
            },
          ])

          // If they don't want to use live branch, fetch branches and let them choose
          if (!useLiveBranch) {
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
                  type: 'list',
                  name: 'selectedBranch',
                  message: 'Select a branch',
                  choices: branches.map(br => {
                    return {
                      name: br.label,
                      value: br.id,
                    }
                  }),
                },
              ])

              branch = selectedBranch || undefined
            }
          }
          // If useLiveBranch is true, branch stays undefined (which uses live branch by default)
        }
      }

      // Save profile
      await this.saveProfile({
        name: profileName,
        account_origin: flags.origin,
        instance_origin: selectedInstance.origin,
        access_token: accessToken,
        workspace,
        branch,
      })

      this.log('')
      this.log(`✓ Profile '${profileName}' created successfully!`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed the prompt')) {
        this.log('Wizard cancelled.')
        process.exit(0)
      }
      throw error
    }
  }

  private async fetchInstances(accessToken: string, origin: string): Promise<Instance[]> {
    const response = await fetch(`${origin}/api:meta/instance`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
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
        id: inst.id || inst.name,
        name: inst.name,
        display: inst.display,
        origin: new URL(inst.meta_api).origin,
      }))
    }

    // If it's an object, try to extract instances
    if (data && typeof data === 'object') {
      const instances = data.instances || data.data || []
      if (Array.isArray(instances)) {
        return instances.map((inst: any) => ({
          id: inst.id || inst.name,
          name: inst.name,
          display: inst.display,
          origin: new URL(inst.meta_api).origin,
        }))
      }
    }

    return []
  }

  private async fetchWorkspaces(accessToken: string, origin: string): Promise<Workspace[]> {
    const response = await fetch(`${origin}/api:meta/workspace`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
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

  private async fetchBranches(
    accessToken: string,
    origin: string,
    workspaceId: string,
  ): Promise<Branch[]> {
    const response = await fetch(`${origin}/api:meta/workspace/${workspaceId}/branch`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
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

  private async saveProfile(profile: ProfileConfig): Promise<void> {
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
      } catch (error) {
        // Continue with empty credentials if parse fails
      }
    }

    // Add or update the profile
    credentials.profiles[profile.name] = {
      account_origin: profile.account_origin,
      instance_origin: profile.instance_origin,
      access_token: profile.access_token,
      ...(profile.workspace && {workspace: profile.workspace}),
      ...(profile.branch && {branch: profile.branch}),
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
