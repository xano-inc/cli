import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import BaseCommand from '../../../../base-command.js'

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

interface TenantCluster {
  created_at?: string
  description?: string
  domain?: string
  id: number
  ingress?: Record<string, unknown>
  name: string
  type?: string
  warm?: Record<string, unknown>
}

export default class TenantClusterEdit extends BaseCommand {
  static override args = {
    cluster_id: Args.integer({
      description: 'Cluster ID to edit',
      required: true,
    }),
  }
  static description = 'Update an existing tenant cluster'
  static examples = [
    `$ xano tenant cluster edit 1 --name "us-east-1-updated" --description "Updated cluster" --domain "us-east.xano.io" --type standard
Updated tenant cluster: us-east-1-updated (standard) - ID: 1
`,
    `$ xano tenant cluster edit 1 --name "eu-west" --description "" --domain "" --type run -o json`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    description: Flags.string({
      char: 'd',
      description: 'Cluster description',
      required: true,
    }),
    domain: Flags.string({
      description: 'Custom domain for the cluster',
      required: true,
    }),
    name: Flags.string({
      char: 'n',
      description: 'Cluster name',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      default: 'summary',
      description: 'Output format',
      options: ['summary', 'json'],
      required: false,
    }),
    type: Flags.string({
      description: 'Cluster type',
      options: ['standard', 'run'],
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(TenantClusterEdit)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentials()

    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xano profile create'`,
      )
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const clusterId = args.cluster_id

    const body: Record<string, unknown> = {
      description: flags.description,
      domain: flags.domain,
      name: flags.name,
      type: flags.type,
    }

    const apiUrl = `${profile.instance_origin}/api:meta/tenant/cluster/${clusterId}`

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          body: JSON.stringify(body),
          headers: {
            'accept': 'application/json',
            'Authorization': `Bearer ${profile.access_token}`,
            'Content-Type': 'application/json',
          },
          method: 'PUT',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      const cluster = await response.json() as TenantCluster

      if (flags.output === 'json') {
        this.log(JSON.stringify(cluster, null, 2))
      } else {
        const type = cluster.type ? ` (${cluster.type})` : ''
        this.log(`Updated tenant cluster: ${cluster.name}${type} - ID: ${cluster.id}`)
        if (cluster.description) this.log(`  Description: ${cluster.description}`)
        if (cluster.domain) this.log(`  Domain: ${cluster.domain}`)
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to edit tenant cluster: ${error.message}`)
      } else {
        this.error(`Failed to edit tenant cluster: ${String(error)}`)
      }
    }
  }

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    if (!fs.existsSync(credentialsPath)) {
      this.error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile create'`,
      )
    }

    try {
      const fileContent = fs.readFileSync(credentialsPath, 'utf8')
      const parsed = yaml.load(fileContent) as CredentialsFile

      if (!parsed || typeof parsed !== 'object' || !('profiles' in parsed)) {
        this.error('Credentials file has invalid format.')
      }

      return parsed
    } catch (error) {
      this.error(`Failed to parse credentials file: ${error}`)
    }
  }
}
