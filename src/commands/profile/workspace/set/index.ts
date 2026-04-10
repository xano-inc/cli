import inquirer from 'inquirer'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand, {buildUserAgent} from '../../../../base-command.js'

interface Workspace {
  id: string
  name: string
}

export default class ProfileWorkspaceSet extends BaseCommand {
  static description = 'Interactively select a workspace for a profile'
  static examples = [
    `$ xano profile workspace set
Fetching workspaces...
? Select a workspace: My Workspace
Workspace updated to 'My Workspace' (abc123) on profile 'default'
`,
    `$ xano profile workspace set -p production
Fetching workspaces...
? Select a workspace: Production API
Workspace updated to 'Production API' (xyz789) on profile 'production'
`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ProfileWorkspaceSet)

    const profileName = flags.profile || this.getDefaultProfile()

    const credentials = this.loadCredentialsFile()
    if (!credentials) {
      this.error("Credentials file not found. Create a profile first using 'xano auth'.")
    }

    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}`,
      )
    }

    const profile = credentials.profiles[profileName]

    this.log('Fetching workspaces...')
    const workspaces = await this.fetchWorkspaces(profile.access_token, profile.instance_origin)

    if (workspaces.length === 0) {
      this.error('No workspaces found on this instance.')
    }

    const {selectedWorkspace} = await inquirer.prompt([
      {
        choices: workspaces.map((ws) => ({
          name:
            String(ws.id) === String(profile.workspace) ? `${ws.name} (${ws.id}) (current)` : `${ws.name} (${ws.id})`,
          value: ws.id,
        })),
        message: 'Select a workspace',
        name: 'selectedWorkspace',
        type: 'select',
      },
    ])

    profile.workspace = selectedWorkspace
    credentials.profiles[profileName] = profile

    const credentialsPath = this.getCredentialsPath()

    const yamlContent = yaml.dump(credentials, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    })

    fs.writeFileSync(credentialsPath, yamlContent, 'utf8')

    const selected = workspaces.find((ws) => ws.id === selectedWorkspace)
    this.log(`Workspace updated to '${selected?.name}' (${selectedWorkspace}) on profile '${profileName}'`)
  }

  private async fetchWorkspaces(accessToken: string, origin: string): Promise<Workspace[]> {
    const response = await fetch(`${origin}/api:meta/workspace`, {
      headers: {
        'User-Agent': buildUserAgent(this.config.version),
        accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      method: 'GET',
    })

    if (!response.ok) {
      if (response.status === 401) {
        this.error('Unauthorized. Your access token may be expired. Re-authenticate with "xano auth".')
      }

      this.error(`Failed to fetch workspaces (status ${response.status})`)
    }

    const data = (await response.json()) as unknown

    if (Array.isArray(data)) {
      return data.map((ws: {id?: string; name: string}) => ({
        id: ws.id || ws.name,
        name: ws.name,
      }))
    }

    return []
  }
}
