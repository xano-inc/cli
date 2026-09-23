import {Flags} from '@oclif/core'
import snakeCase from 'lodash.snakecase'
import * as fs from 'node:fs'
import path from 'node:path'

import BaseCommand from '../../../base-command.js'
import {
  buildApiGroupFolderResolver,
  buildChannelServerResolver,
  type ParsedDocument,
  parseDocument,
  policyBaseName,
  resolveDocumentPath,
} from '../../../utils/document-parser.js'
import {fetchKnowledge, writeKnowledge} from '../../../utils/knowledge-sync.js'

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

    // Resolve the output directory
    const outputDir = path.resolve(flags.directory)
    const clashing = this.policyClashes(documents, outputDir)

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
    for (const doc of documents.filter((document) => !clashing.has(document))) {
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
      fs.writeFileSync(filePath, doc.content, 'utf8')
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
    // Policy files state the rules; the skill the instance generates tells an agent how to follow them.
    if (documents.some((doc) => doc.type === 'policy')) {
      this.log('Run `xano skills pull` to install the policies skill for your coding agent.')
    }
  }

  /**
   * Policy keys are case-sensitive on the server, but file names are not on every checkout. The
   * policies whose file name differs only in case from another exported policy, or from a local file
   * it would overwrite, are left out with a warning; everything else is written. Local policy files
   * the export no longer carries are kept, with a warning.
   */
  private policyClashes(documents: ParsedDocument[], outputDir: string): Set<ParsedDocument> {
    const exported = new Map<string, string[]>()
    for (const doc of documents.filter(doc => doc.type === 'policy')) {
      const filename = `${policyBaseName(doc.name)}.xs`
      exported.set(filename.toLowerCase(), [...(exported.get(filename.toLowerCase()) ?? []), filename])
    }

    const clashes = new Map<string, string>()
    for (const [normalized, names] of exported) {
      if (names.length > 1) clashes.set(normalized, names.map(name => `policies/${name}`).join(' and '))
    }

    const policyDir = path.join(outputDir, 'policies')
    const localFiles = fs.existsSync(policyDir)
      ? fs.readdirSync(policyDir, {withFileTypes: true})
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.xs'))
        .map(entry => entry.name)
        .sort()
      : []
    const stale: string[] = []
    for (const filename of localFiles) {
      const names = exported.get(filename.toLowerCase())
      if (!names) stale.push(`policies/${filename}`)
      else if (!names.includes(filename) && !clashes.has(filename.toLowerCase())) {
        clashes.set(filename.toLowerCase(), `policies/${names[0]} (local policies/${filename})`)
      }
    }

    if (clashes.size > 0) {
      this.warn(
        `Policy files that differ only in case are left out of this pull; everything else is written:\n  ${[...clashes.values()].join('\n  ')}\n` +
          'Rename one of the policies, or move the local file aside, then pull again.',
      )
    }

    if (stale.length > 0) {
      this.warn(
        `Stale local policy files are absent from this export and were kept:\n  ${stale.join('\n  ')}\nReview them before pushing; a push can publish these policies again.`,
      )
    }

    return new Set(documents.filter(doc => doc.type === 'policy' && clashes.has(`${doc.name}.xs`.toLowerCase())))
  }
}
