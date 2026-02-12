import {Args, Flags} from '@oclif/core'
import * as yaml from 'js-yaml'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import snakeCase from 'lodash.snakecase'

import BaseCommand from '../../../base-command.js'

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

interface ParsedDocument {
  apiGroup?: string
  content: string
  name: string
  type: string
  verb?: string
}

export default class Pull extends BaseCommand {
  static args = {
    directory: Args.string({
      description: 'Output directory for pulled documents',
      required: true,
    }),
  }
static description = 'Pull a workspace multidoc from the Xano Metadata API and split into individual files'
static examples = [
    `$ xano workspace pull ./my-workspace
Pulled 42 documents to ./my-workspace
`,
    `$ xano workspace pull ./output -w 40
Pulled 15 documents to ./output
`,
    `$ xano workspace pull ./backup --profile production --env --records
Pulled 58 documents to ./backup
`,
  ]
static override flags = {
    ...BaseCommand.baseFlags,
    env: Flags.boolean({
      default: false,
      description: 'Include environment variables',
      required: false,
    }),
    records: Flags.boolean({
      default: false,
      description: 'Include records',
      required: false,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Pull)

    // Get profile name (default or from flag/env)
    const profileName = flags.profile || this.getDefaultProfile()

    // Load credentials
    const credentials = this.loadCredentials()

    // Get the profile configuration
    if (!(profileName in credentials.profiles)) {
      this.error(
        `Profile '${profileName}' not found. Available profiles: ${Object.keys(credentials.profiles).join(', ')}\n` +
        `Create a profile using 'xano profile:create'`,
      )
    }

    const profile = credentials.profiles[profileName]

    // Validate required fields
    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
        `  1. Provide it as a flag: xano workspace pull <directory> -w <workspace_id>\n` +
        `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Build query parameters
    const queryParams = new URLSearchParams({
      env: flags.env.toString(),
      records: flags.records.toString(),
    })

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/multidoc?${queryParams.toString()}`

    // Fetch multidoc from the API
    let responseText: string
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'accept': 'application/json',
          'Authorization': `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      })

      if (!response.ok) {
        const errorText = await response.text()
        this.error(
          `API request failed with status ${response.status}: ${response.statusText}\n${errorText}`,
        )
      }

      responseText = await response.text()
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Failed to fetch multidoc: ${error.message}`)
      } else {
        this.error(`Failed to fetch multidoc: ${String(error)}`)
      }
    }

    // Split the response into individual documents
    const rawDocuments = responseText.split('\n---\n')

    // Parse each document
    const documents: ParsedDocument[] = []
    for (const raw of rawDocuments) {
      const trimmed = raw.trim()
      if (!trimmed) {
        continue
      }

      const parsed = this.parseDocument(trimmed)
      if (parsed) {
        documents.push(parsed)
      }
    }

    if (documents.length === 0) {
      this.log('No documents found in response')
      return
    }

    // Resolve the output directory
    const outputDir = path.resolve(args.directory)

    // Create the output directory if it doesn't exist
    fs.mkdirSync(outputDir, {recursive: true})

    // Track filenames per type to handle duplicates
    const filenameCounters: Map<string, Map<string, number>> = new Map()

    let writtenCount = 0
    for (const doc of documents) {
      let typeDir: string
      let baseName: string

      if (doc.type === 'workspace') {
        // workspace → workspace.xs at root
        typeDir = outputDir
        baseName = 'workspace'
      } else if (doc.type === 'api_group') {
        // api_group "test" → api/test/api_group.xs
        const groupFolder = snakeCase(doc.name)
        typeDir = path.join(outputDir, 'api', groupFolder)
        baseName = 'api_group'
      } else if (doc.type === 'query' && doc.apiGroup) {
        // query in group "test" → api/test/{query_name}.xs
        const groupFolder = snakeCase(doc.apiGroup)
        const nameParts = doc.name.split('/')
        const leafName = nameParts.pop()!
        const folderParts = nameParts.map((part) => snakeCase(part))
        typeDir = path.join(outputDir, 'api', groupFolder, ...folderParts)
        baseName = this.sanitizeFilename(leafName)
        if (doc.verb) {
          baseName = `${baseName}_${doc.verb}`
        }
      } else {
        // Default: split folder path from name
        const nameParts = doc.name.split('/')
        const leafName = nameParts.pop()!
        const folderParts = nameParts.map((part) => snakeCase(part))
        typeDir = path.join(outputDir, doc.type, ...folderParts)
        baseName = this.sanitizeFilename(leafName)
        if (doc.verb) {
          baseName = `${baseName}_${doc.verb}`
        }
      }

      fs.mkdirSync(typeDir, {recursive: true})

      // Track duplicates per directory
      const dirKey = path.relative(outputDir, typeDir)
      if (!filenameCounters.has(dirKey)) {
        filenameCounters.set(dirKey, new Map())
      }

      const typeCounters = filenameCounters.get(dirKey)!
      const count = typeCounters.get(baseName) || 0
      typeCounters.set(baseName, count + 1)

      // Append numeric suffix for duplicates
      let filename: string
      filename = count === 0 ? `${baseName}.xs` : `${baseName}_${count + 1}.xs`;

      const filePath = path.join(typeDir, filename)
      fs.writeFileSync(filePath, doc.content, 'utf8')
      writtenCount++
    }

    this.log(`Pulled ${writtenCount} documents to ${args.directory}`)
  }

  private loadCredentials(): CredentialsFile {
    const configDir = path.join(os.homedir(), '.xano')
    const credentialsPath = path.join(configDir, 'credentials.yaml')

    // Check if credentials file exists
    if (!fs.existsSync(credentialsPath)) {
      this.error(
        `Credentials file not found at ${credentialsPath}\n` +
        `Create a profile using 'xano profile:create'`,
      )
    }

    // Read credentials file
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

  /**
   * Parse a single document to extract its type, name, and optional verb.
   * Skips leading comment lines (starting with //) to find the first
   * meaningful line containing the type keyword and name.
   */
  private parseDocument(content: string): null | ParsedDocument {
    const lines = content.split('\n')

    // Find the first non-comment line
    let firstLine: null | string = null
    for (const line of lines) {
      const trimmedLine = line.trim()
      if (trimmedLine && !trimmedLine.startsWith('//')) {
        firstLine = trimmedLine
        break
      }
    }

    if (!firstLine) {
      return null
    }

    // Parse the type keyword and name from the first meaningful line
    // Expected formats:
    //   type name {
    //   type name verb=GET {
    //   type "name with spaces" {
    //   type "name with spaces" verb=PATCH {
    const match = firstLine.match(/^(\w+)\s+("(?:[^"\\]|\\.)*"|\S+)(?:\s+(.*))?/)
    if (!match) {
      return null
    }

    const type = match[1]
    let name = match[2]
    const rest = match[3] || ''

    // Strip surrounding quotes from the name
    if (name.startsWith('"') && name.endsWith('"')) {
      name = name.slice(1, -1)
    }

    // Extract verb if present (e.g., verb=GET)
    let verb: string | undefined
    const verbMatch = rest.match(/verb=(\S+)/)
    if (verbMatch) {
      verb = verbMatch[1]
    }

    // Extract api_group if present (e.g., api_group = "test")
    let apiGroup: string | undefined
    const apiGroupMatch = content.match(/api_group\s*=\s*"([^"]*)"/)
    if (apiGroupMatch) {
      apiGroup = apiGroupMatch[1]
    }

    return {apiGroup, content, name, type, verb}
  }

  /**
   * Sanitize a document name for use as a filename.
   * Strips quotes, replaces spaces with underscores, and removes
   * characters that are unsafe in filenames.
   */
  private sanitizeFilename(name: string): string {
    return snakeCase(name.replaceAll('"', ''))
  }
}
