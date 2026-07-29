import {Flags} from '@oclif/core'
import * as fs from 'node:fs'
import * as path from 'node:path'

import snakeCase from 'lodash.snakecase'

import BaseCommand from '../../../base-command.js'
import {
  buildApiGroupFolderResolver,
  buildChannelServerResolver,
  type ParsedDocument,
  parseDocument,
  resolveDocumentPath,
} from '../../../utils/document-parser.js'

export default class Pull extends BaseCommand {
  static override description = 'Pull a tenant multidoc from the Xano Metadata API and split into individual files'
  static override examples = [
    `$ xano tenant pull -t my-tenant
Pulled 42 documents from tenant my-tenant to current directory
`,
    `$ xano tenant pull -d ./my-tenant -t my-tenant
Pulled 42 documents from tenant my-tenant to ./my-tenant
`,
    `$ xano tenant pull -d ./output -t my-tenant -w 40
Pulled 15 documents from tenant my-tenant to ./output
`,
    `$ xano tenant pull -t my-tenant --profile production --env --records
Pulled 58 documents from tenant my-tenant
`,
    `$ xano tenant pull -t my-tenant --draft`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    directory: Flags.string({
      char: 'd',
      default: '.',
      description: 'Output directory for pulled documents (defaults to current directory)',
      required: false,
    }),
    draft: Flags.boolean({
      default: false,
      description: 'Include draft versions',
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
    tenant: Flags.string({
      char: 't',
      description: 'Tenant name to pull from',
      required: true,
    }),
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Pull)

    const {profileName, profile} = this.resolveProfile(flags)

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano tenant pull -t <tenant_name> -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    const tenantName = flags.tenant

    // Build query parameters
    const queryParams = new URLSearchParams({
      env: flags.env.toString(),
      include_draft: flags.draft.toString(),
      records: flags.records.toString(),
    })

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/tenant/${tenantName}/multidoc?${queryParams.toString()}`

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

    // Resolve a realtime v2 channel path -> owning realtime_server name, so
    // messages can nest under their channel's server (see resolver docs).
    const getChannelServer = buildChannelServerResolver(documents)

    // Track filenames per type to handle duplicates
    const filenameCounters: Map<string, Map<string, number>> = new Map()

    let writtenCount = 0
    for (const doc of documents) {
      const {baseName, typeDir} = resolveDocumentPath(doc, outputDir, {
        getApiGroupFolder,
        getChannelServer,
        join: path.join,
        snakeCase,
      })

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

    this.log(`Pulled ${writtenCount} documents from tenant ${tenantName} to ${flags.directory}`)
  }

}
