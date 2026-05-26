import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import snakeCase from 'lodash.snakecase'

import BaseCommand, {type ProfileConfig} from '../../../base-command.js'
import {buildApiGroupFolderResolver, type ParsedDocument, parseDocument} from '../../../utils/document-parser.js'

interface Release {
  id: number
  name: string
}

export default class ReleasePull extends BaseCommand {
  static override description = 'Pull a release multidoc from the Xano Metadata API and split into individual files'
  static override examples = [
    `$ xano release pull -r v1.0
Pulled 42 documents from release 'v1.0' to current directory
`,
    `$ xano release pull -d ./my-release -r v1.0
Pulled 42 documents from release 'v1.0' to ./my-release
`,
    `$ xano release pull -d ./output -r v1.0 -w 40
Pulled 15 documents from release 'v1.0' to ./output
`,
    `$ xano release pull -r v1.0 --profile production --env --records
Pulled 58 documents from release 'v1.0'
`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    directory: Flags.string({
      char: 'd',
      default: '.',
      description: 'Output directory for pulled documents (defaults to current directory)',
      required: false,
    }),
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
    release: Flags.string({
      char: 'r',
      description: 'Release name to pull from',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ReleasePull)

    const {profile} = this.resolveProfile(flags)

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano release pull -r <release_name> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile:edit --workspace <workspace_id>`,
      )
    }

    const releaseName = flags.release
    const releaseId = await this.resolveReleaseName(profile, workspaceId, releaseName, flags.verbose)

    // Build query parameters
    const queryParams = new URLSearchParams({
      env: flags.env.toString(),
      records: flags.records.toString(),
    })

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release/${releaseId}/multidoc?${queryParams.toString()}`

    // Fetch multidoc from the API
    let responseText: string
    const requestHeaders = {
      accept: 'application/json',
      Authorization: `Bearer ${profile.access_token}`,
    }

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: requestHeaders,
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const errorText = await response.text()
        this.error(`API request failed with status ${response.status}: ${response.statusText}\n${errorText}`)
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

      const parsed = parseDocument(trimmed)
      if (parsed) {
        documents.push(parsed)
      }
    }

    if (documents.length === 0) {
      this.log('No documents found in response')
      return
    }

    // Resolve the output directory
    const outputDir = path.resolve(flags.directory)

    // Create the output directory if it doesn't exist
    fs.mkdirSync(outputDir, {recursive: true})

    // Resolve api_group names to unique folder names, disambiguating collisions
    const getApiGroupFolder = buildApiGroupFolderResolver(documents, snakeCase)

    // Track filenames per type to handle duplicates
    const filenameCounters: Map<string, Map<string, number>> = new Map()

    let writtenCount = 0
    for (const doc of documents) {
      let typeDir: string
      let baseName: string

      if (doc.type === 'workspace') {
        // workspace → workspace/{name}.xs
        typeDir = path.join(outputDir, 'workspace')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'workspace_trigger') {
        // workspace_trigger → workspace/trigger/{name}.xs
        typeDir = path.join(outputDir, 'workspace', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'error_trigger') {
        // error_trigger → workspace/trigger/{name}.xs (singleton, colocated with workspace triggers)
        typeDir = path.join(outputDir, 'workspace', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'agent') {
        // agent → ai/agent/{name}.xs
        typeDir = path.join(outputDir, 'ai', 'agent')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'mcp_server') {
        // mcp_server → ai/mcp_server/{name}.xs
        typeDir = path.join(outputDir, 'ai', 'mcp_server')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'tool') {
        // tool → ai/tool/{name}.xs
        typeDir = path.join(outputDir, 'ai', 'tool')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'agent_trigger') {
        // agent_trigger → ai/agent/trigger/{name}.xs
        typeDir = path.join(outputDir, 'ai', 'agent', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'mcp_server_trigger') {
        // mcp_server_trigger → ai/mcp_server/trigger/{name}.xs
        typeDir = path.join(outputDir, 'ai', 'mcp_server', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'table_trigger') {
        // table_trigger → table/trigger/{name}.xs
        typeDir = path.join(outputDir, 'table', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'realtime_channel') {
        // realtime_channel → realtime/channel/{name}.xs
        typeDir = path.join(outputDir, 'realtime', 'channel')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'realtime_trigger') {
        // realtime_trigger → realtime/trigger/{name}.xs
        typeDir = path.join(outputDir, 'realtime', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'api_group') {
        // api_group "test" → api/{resolved_folder}/{name}.xs
        const groupFolder = getApiGroupFolder(doc.name)
        typeDir = path.join(outputDir, 'api', groupFolder)
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'query' && doc.apiGroup) {
        // query in group "test" → api/{resolved_folder}/{query_name}.xs
        const groupFolder = getApiGroupFolder(doc.apiGroup)
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
      filename = count === 0 ? `${baseName}.xs` : `${baseName}_${count + 1}.xs`

      const filePath = path.join(typeDir, filename)
      fs.writeFileSync(filePath, doc.content, 'utf8')
      writtenCount++
    }

    this.log(`Pulled ${writtenCount} documents from release '${releaseName}' to ${flags.directory}`)
  }

  private async resolveReleaseName(
    profile: ProfileConfig,
    workspaceId: string,
    releaseName: string,
    verbose: boolean,
  ): Promise<number> {
    const listUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/release`

    const response = await this.verboseFetch(
      listUrl,
      {
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${profile.access_token}`,
        },
        method: 'GET',
      },
      verbose,
      profile.access_token,
    )

    if (!response.ok) {
      const errorText = await response.text()
      this.error(`Failed to list releases: ${response.status} ${response.statusText}\n${errorText}`)
    }

    const data = (await response.json()) as Release[] | {items?: Release[]}
    const releases: Release[] = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)
        ? data.items
        : []

    const match = releases.find((r) => r.name === releaseName)
    if (!match) {
      const available = releases.map((r) => r.name).join(', ')
      this.error(`Release '${releaseName}' not found.${available ? ` Available releases: ${available}` : ''}`)
    }

    return match.id
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
