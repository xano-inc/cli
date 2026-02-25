import {ExitPromptError} from '@inquirer/core'
import {Command, Flags} from '@oclif/core'
import inquirer from 'inquirer'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as http from 'node:http'
import * as os from 'node:os'
import {join} from 'node:path'
import open from 'open'

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

interface UserInfo {
  email: string
  id: string
  name: string
}

const AUTH_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

export default class Auth extends Command {
  static override description = 'Authenticate with Xano via browser login'
  static override examples = [
    `$ xano auth
Opening browser for Xano login...
Waiting for authentication...
Authenticated as John Doe (john@example.com)
? Select an instance: US-1 (Production)
? Profile name: default
Profile 'default' created successfully!`,
    `$ xano auth --origin https://custom.xano.com
Opening browser for Xano login at https://custom.xano.com...`,
  ]
  static override flags = {
    origin: Flags.string({
      char: 'o',
      default: 'https://app.xano.com',
      description: 'Xano account origin URL',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Auth)

    try {
      // Step 1: Get token via browser auth
      this.log('Starting authentication flow...')
      const token = await this.startAuthServer(flags.origin)

      // Step 2: Validate token and get user info
      this.log('')
      this.log('Validating authentication...')
      const user = await this.validateToken(token, flags.origin)
      this.log(`Authenticated as ${user.name} (${user.email})`)

      // Step 3: Fetch and select instance
      this.log('')
      this.log('Fetching available instances...')
      const instances = await this.fetchInstances(token, flags.origin)

      if (instances.length === 0) {
        this.error('No instances found. Please check your account.')
      }

      const instance = await this.selectInstance(instances)

      // Step 4: Workspace selection
      let workspace: undefined | Workspace
      let branch: string | undefined
      this.log('')
      this.log('Fetching available workspaces...')
      const workspaces = await this.fetchWorkspaces(token, instance.origin)

      if (workspaces.length > 0) {
        workspace = await this.selectWorkspace(workspaces)

        if (workspace) {
          // Step 5: Branch selection
          this.log('')
          this.log('Fetching available branches...')
          const branches = await this.fetchBranches(token, instance.origin, workspace.id)

          if (branches.length > 0) {
            branch = await this.selectBranch(branches)
          }
        }
      }

      // Step 6: Profile name
      this.log('')
      const profileName = await this.promptProfileName()

      // Step 7: Save profile
      await this.saveProfile({
        access_token: token,
        account_origin: flags.origin,
        branch,
        instance_origin: instance.origin,
        name: profileName,
        workspace: workspace?.id,
      })

      this.log('')
      this.log(`Profile '${profileName}' created successfully!`)

      // Ensure clean exit (the open() call can keep the event loop alive)
      process.exit(0)
    } catch (error) {
      if (error instanceof ExitPromptError) {
        this.log('Authentication cancelled.')
        return
      }

      throw error
    }
  }

  private async fetchBranches(accessToken: string, origin: string, workspaceId: string): Promise<Branch[]> {
    try {
      const response = await fetch(`${origin}/api:meta/workspace/${workspaceId}/branch`, {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`)
      }

      const data = (await response.json()) as unknown

      if (Array.isArray(data)) {
        return data.map((br: {id?: string; label: string}) => ({
          id: br.id || br.label,
          label: br.label,
        }))
      }

      return []
    } catch {
      return []
    }
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

    const data = (await response.json()) as unknown

    if (Array.isArray(data)) {
      return data.map((inst: {display: string; id?: string; meta_api: string; name: string}) => ({
        display: inst.display,
        id: inst.id || inst.name,
        name: inst.name,
        origin: new URL(inst.meta_api).origin,
      }))
    }

    return []
  }

  private async fetchWorkspaces(accessToken: string, origin: string): Promise<Workspace[]> {
    try {
      const response = await fetch(`${origin}/api:meta/workspace`, {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`)
      }

      const data = (await response.json()) as unknown

      if (Array.isArray(data)) {
        return data.map((ws: {id?: string; name: string}) => ({
          id: ws.id || ws.name,
          name: ws.name,
        }))
      }

      return []
    } catch {
      return []
    }
  }

  private async promptProfileName(): Promise<string> {
    const {profileName} = await inquirer.prompt([
      {
        default: 'default',
        message: 'Profile name',
        name: 'profileName',
        type: 'input',
        validate(input: string) {
          const trimmed = input.trim()
          if (trimmed === '') {
            return true // Will use default
          }

          return true
        },
      },
    ])

    return profileName.trim() || 'default'
  }

  private async saveProfile(profile: ProfileConfig): Promise<void> {
    const configDir = join(os.homedir(), '.xano')
    const credentialsPath = join(configDir, 'credentials.yaml')

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

    // Set as default profile
    credentials.default = profile.name

    // Write the updated credentials back to the file
    const yamlContent = yaml.dump(credentials, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    })

    fs.writeFileSync(credentialsPath, yamlContent, 'utf8')
  }

  private async selectBranch(branches: Branch[]): Promise<string | undefined> {
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

    return selectedBranch || undefined
  }

  private async selectInstance(instances: Instance[]): Promise<Instance> {
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

    return instances.find((inst) => inst.id === instanceId)!
  }

  private async selectWorkspace(workspaces: Workspace[]): Promise<undefined | Workspace> {
    const {selectedWorkspace} = await inquirer.prompt([
      {
        choices: [
          {name: '(Skip workspace)', value: ''},
          ...workspaces.map((ws) => ({
            name: ws.name,
            value: ws.id,
          })),
        ],
        message: 'Select a workspace',
        name: 'selectedWorkspace',
        type: 'select',
      },
    ])

    if (!selectedWorkspace) {
      return undefined
    }

    return workspaces.find((ws) => ws.id === selectedWorkspace)
  }

  private startAuthServer(origin: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url || '', `http://${req.headers.host}`)

        if (url.pathname === '/callback') {
          const token = url.searchParams.get('token')

          if (token) {
            // Send success response to browser
            res.writeHead(200, {'Content-Type': 'text/html'})
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Xano CLI - Authentication Successful</title>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      display: flex;
                      flex-direction: column;
                      justify-content: center;
                      align-items: center;
                      min-height: 100vh;
                      margin: 0;
                      background: #f4f5f7;
                      color: #1a1a2e;
                    }
                    .container {
                      text-align: center;
                      padding: 48px;
                      background: white;
                      border-radius: 12px;
                      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                      max-width: 400px;
                    }
                    .checkmark {
                      width: 64px;
                      height: 64px;
                      background: #1b62f8;
                      border-radius: 50%;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      margin: 0 auto 24px;
                    }
                    .checkmark svg {
                      width: 32px;
                      height: 32px;
                      fill: white;
                    }
                    h1 {
                      font-size: 24px;
                      font-weight: 600;
                      margin: 0 0 12px;
                      color: #1a1a2e;
                    }
                    p {
                      font-size: 14px;
                      color: #6b7280;
                      margin: 0;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="checkmark">
                      <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                    </div>
                    <h1>Authentication Successful</h1>
                    <p>You can now close this window and return to your terminal.</p>
                  </div>
                </body>
              </html>
            `)

            // Close server and resolve with token
            clearTimeout(timeout)
            server.close()
            resolve(decodeURIComponent(token))
          } else {
            res.writeHead(400, {'Content-Type': 'text/html'})
            res.end(`
              <!DOCTYPE html>
              <html>
                <head>
                  <title>Xano CLI - Authentication Failed</title>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      display: flex;
                      flex-direction: column;
                      justify-content: center;
                      align-items: center;
                      min-height: 100vh;
                      margin: 0;
                      background: #f4f5f7;
                      color: #1a1a2e;
                    }
                    .container {
                      text-align: center;
                      padding: 48px;
                      background: white;
                      border-radius: 12px;
                      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                      max-width: 400px;
                    }
                    .error-icon {
                      width: 64px;
                      height: 64px;
                      background: #ef4444;
                      border-radius: 50%;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      margin: 0 auto 24px;
                    }
                    .error-icon svg {
                      width: 32px;
                      height: 32px;
                      fill: white;
                    }
                    h1 {
                      font-size: 24px;
                      font-weight: 600;
                      margin: 0 0 12px;
                      color: #1a1a2e;
                    }
                    p {
                      font-size: 14px;
                      color: #6b7280;
                      margin: 0;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <div class="error-icon">
                      <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
                    </div>
                    <h1>Authentication Failed</h1>
                    <p>No token received. Please close this window and try again.</p>
                  </div>
                </body>
              </html>
            `)
          }
        } else {
          res.writeHead(404)
          res.end('Not found')
        }
      })

      // Set timeout
      const timeout = setTimeout(() => {
        server.close()
        reject(new Error('Authentication timed out. Please try again.'))
      }, AUTH_TIMEOUT_MS)

      // Handle server errors
      server.on('error', (err) => {
        clearTimeout(timeout)
        reject(new Error(`Failed to start auth server: ${err.message}`))
      })

      // Start server on random available port
      server.listen(0, '127.0.0.1', async () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          clearTimeout(timeout)
          server.close()
          reject(new Error('Failed to get server address'))
          return
        }

        const {port} = address
        const callbackUrl = encodeURIComponent(`http://127.0.0.1:${port}/callback`)
        const authUrl = `${origin}/login?dest=cli&callback=${callbackUrl}`

        this.log(`Opening browser for Xano login...`)
        this.log('')

        try {
          await open(authUrl)
          this.log('Waiting for authentication...')
          this.log('(If the browser did not open, visit this URL manually:)')
          this.log(authUrl)
        } catch {
          this.log('Could not open browser automatically.')
          this.log('Please visit this URL to authenticate:')
          this.log(authUrl)
        }
      })
    })
  }

  private async validateToken(token: string, origin: string): Promise<UserInfo> {
    const response = await fetch(`${origin}/api:meta/auth/me`, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid or expired token. Please try again.')
      }

      throw new Error(`Token validation failed with status ${response.status}`)
    }

    return (await response.json()) as UserInfo
  }
}
