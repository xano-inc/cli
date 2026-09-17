import {Flags} from '@oclif/core'
import snakeCase from 'lodash.snakecase'
import * as fs from 'node:fs'
import path from 'node:path'

import BaseCommand from '../../../base-command.js'
import {
  buildApiGroupFolderResolver,
  buildChannelServerResolver,
  documentFileContent,
  type ParsedDocument,
  parseDocument,
  resolveDocumentPath,
} from '../../../utils/document-parser.js'
import {fetchKnowledge, writeKnowledge} from '../../../utils/knowledge-sync.js'
import {policyFileName} from '../../../utils/policy.js'

export default class Pull extends BaseCommand {
  static description = 'Pull a workspace multidoc from the Xano Metadata API and split into individual files'
  static examples = [
    `$ xano workspace pull
Pulled 42 documents + 5 knowledge files to current directory
`,
    `$ xano workspace pull -d ./my-workspace
Pulled 42 documents to ./my-workspace
`,
    `$ xano workspace pull -d ./output -w 40
Pulled 15 documents to ./output
`,
    `$ xano workspace pull --profile production --env --records
Pulled 58 documents
`,
    `$ xano workspace pull --draft`,
    `$ xano workspace pull -b dev`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch name (optional if set in profile, defaults to live)',
      required: false,
    }),
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
    workspace: Flags.string({
      char: 'w',
      description: 'Workspace ID (optional if set in profile)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(Pull)

    const {profile, profileName} = this.resolveProfile(flags)

    // Determine workspace_id from flag or profile
    let workspaceId: string
    if (flags.workspace) {
      workspaceId = flags.workspace
    } else if (profile.workspace) {
      workspaceId = profile.workspace
    } else {
      this.error(
        `Workspace ID is required. Either:\n` +
          `  1. Provide it as a flag: xano workspace pull -w <workspace_id>\n` +
          `  2. Set it in your profile using: xano profile:edit ${profileName} -w <workspace_id>`,
      )
    }

    // Determine branch from flag or profile
    const branch = flags.branch || profile.branch || ''

    // Build query parameters
    const queryParams = new URLSearchParams({
      branch,
      env: flags.env.toString(),
      include_draft: flags.draft.toString(),
      records: flags.records.toString(),
    })

    // Construct the API URL
    const apiUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/multidoc?${queryParams.toString()}`

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
        this.error(await this.parseApiError(response, 'API request failed'))
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

    // Resolve the output directory
    const outputDir = path.resolve(flags.directory)
    this.checkPolicyFiles(documents, outputDir)

    if (documents.length === 0) {
      this.log('No documents found in response')
      return
    }

    // Create the output directory if it doesn't exist
    fs.mkdirSync(outputDir, {recursive: true})

    // Resolve api_group names to unique folder names, disambiguating collisions
    // where different names produce the same snakeCase (e.g., "Authentication" vs "authentication")
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
      const filename = count === 0 ? `${baseName}.xs` : `${baseName}_${count + 1}.xs`

      const filePath = path.join(typeDir, filename)
      fs.writeFileSync(filePath, documentFileContent(doc.content), 'utf8')
      writtenCount++
    }

    // ── Pull knowledge ────────────────────────────────────────────────────

    const knowledgeUrl = `${profile.instance_origin}/api:meta/workspace/${workspaceId}/knowledge/sync`
    const knowledgeObjects = await fetchKnowledge(
      knowledgeUrl,
      branch,
      profile.access_token,
      this.verboseFetch.bind(this),
      flags.verbose,
    )

    let knowledgeCount = 0
    if (knowledgeObjects.length > 0) {
      knowledgeCount = writeKnowledge(knowledgeObjects, outputDir)
    }

    const parts: string[] = [`${writtenCount} documents`]
    if (knowledgeCount > 0) parts.push(`${knowledgeCount} knowledge file${knowledgeCount === 1 ? '' : 's'}`)
    this.log(`Pulled ${parts.join(' + ')} to ${flags.directory}`)
  }

  /**
   * Refuse portable filename collisions before writing, and retain stale local policies with a warning.
   */
  private checkPolicyFiles(documents: ParsedDocument[], outputDir: string): void {
    const targets = new Map<string, string>()
    for (const doc of documents.filter(doc => doc.type === 'policy')) {
      const filename = policyFileName(doc.name)
      const normalized = filename.toLowerCase()
      const existing = targets.get(normalized)
      if (existing) {
        this.error(
          `Policy filename collision: policies/${existing} and policies/${filename} target the same case-insensitive filename. No files were written.`,
          {exit: 1},
        )
      }

      targets.set(normalized, filename)
    }

    const policyDir = path.join(outputDir, 'policies')
    if (!fs.existsSync(policyDir)) return

    const localFiles = fs.readdirSync(policyDir, {withFileTypes: true})
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.xs'))
      .map(entry => entry.name)
      .sort()
    const stale: string[] = []
    for (const filename of localFiles) {
      const target = targets.get(filename.toLowerCase())
      if (target && target !== filename) {
        this.error(
          `Policy filename collision: local policies/${filename} and exported policies/${target} target the same case-insensitive filename. No files were written.`,
          {exit: 1},
        )
      }

      if (!target) stale.push(`policies/${filename}`)
    }

    if (stale.length > 0) {
      this.warn(
        `Stale local policy files are absent from this export and were kept:\n  ${stale.join('\n  ')}\nReview them before pushing; a push can publish these policies again.`,
      )
    }
  }
}
