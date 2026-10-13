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
  resolveDocumentPath,
} from '../../../utils/document-parser.js'
import {fetchKnowledge, writeKnowledge} from '../../../utils/knowledge-sync.js'
import {writeMarkerToken} from '../../../utils/sandbox-marker.js'
import {
  instanceHost,
  recordEntriesForPaths,
  sandboxTargetIdentity,
  saveSyncState,
  syncStateExists,
} from '../../../utils/sync-state.js'

/**
 * Whether pull should write `.xano/sync_state.json`: only when asked to, or to keep an existing
 * record current. A `--draft` pull never writes it, because `--fast` compares against published
 * versions and recording draft bodies as synced would stop those drafts from being pushed.
 */
export function syncStateAction(flag: boolean, dir: string, draft: boolean): 'draft' | 'skip' | 'write' {
  if (!flag && !syncStateExists(dir)) return 'skip'
  return draft ? 'draft' : 'write'
}

export default class SandboxPull extends BaseCommand {
  static override description = 'Pull documents from your sandbox environment and split into individual files'
  static override examples = [
    `$ xano sandbox pull
Pulled 42 documents from sandbox environment to current directory
`,
    `$ xano sandbox pull -d ./my-sandbox
Pulled 42 documents from sandbox environment to ./my-sandbox
`,
    `$ xano sandbox pull --env --records`,
    `$ xano sandbox pull --sync-state
Write .xano/sync_state.json after pulling; later pulls keep it current while it exists
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
    'sync-state': Flags.boolean({
      default: false,
      description:
        'Write .xano/sync_state.json after a successful pull. Needed only the first time; later pulls keep the record current while it exists.',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(SandboxPull)
    const {profile} = this.resolveProfile(flags)

    const queryParams = new URLSearchParams({
      env: flags.env.toString(),
      include_draft: flags.draft.toString(),
      records: flags.records.toString(),
    })

    const apiUrl = `${profile.instance_origin}/api:meta/sandbox/multidoc?${queryParams.toString()}`

    let responseText: string

    try {
      const response = await this.verboseFetch(
        apiUrl,
        {
          headers: {
            accept: 'application/json',
            Authorization: `Bearer ${profile.access_token}`,
          },
          method: 'GET',
        },
        flags.verbose,
        profile.access_token,
      )

      if (!response.ok) {
        const message = await this.parseApiError(response, 'API request failed')
        this.error(message)
      }

      responseText = await response.text()
    } catch (error) {
      if (error instanceof Error && 'oclif' in error) throw error
      if (error instanceof Error) {
        this.error(`Failed to fetch multidoc: ${error.message}`)
      } else {
        this.error(`Failed to fetch multidoc: ${String(error)}`)
      }
    }

    const rawDocuments = responseText.split('\n---\n')

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
    }

    const outputDir = path.resolve(flags.directory)
    fs.mkdirSync(outputDir, {recursive: true})

    const getApiGroupFolder = buildApiGroupFolderResolver(documents, snakeCase)

    // Resolve a realtime v2 channel path -> owning realtime_server name, so
    // messages can nest under their channel's server (see resolver docs).
    const getChannelServer = buildChannelServerResolver(documents)

    const filenameCounters: Map<string, Map<string, number>> = new Map()

    let writtenCount = 0
    const writtenPaths: string[] = []
    for (const doc of documents) {
      const {baseName, typeDir} = resolveDocumentPath(doc, outputDir, {
        getApiGroupFolder,
        getChannelServer,
        join: path.join,
        snakeCase,
      })

      fs.mkdirSync(typeDir, {recursive: true})

      const dirKey = path.relative(outputDir, typeDir)
      if (!filenameCounters.has(dirKey)) {
        filenameCounters.set(dirKey, new Map())
      }

      const typeCounters = filenameCounters.get(dirKey)!
      const count = typeCounters.get(baseName) || 0
      typeCounters.set(baseName, count + 1)

      const filename = count === 0 ? `${baseName}.xs` : `${baseName}_${count + 1}.xs`

      const filePath = path.join(typeDir, filename)
      fs.writeFileSync(filePath, doc.content, 'utf8')
      writtenPaths.push(filePath)
      writtenCount++
    }

    // ── Pull knowledge ────────────────────────────────────────────────────

    const knowledgeUrl = `${profile.instance_origin}/api:meta/sandbox/knowledge/sync`
    const knowledgeObjects = await fetchKnowledge(
      knowledgeUrl,
      '',
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
    this.log(`Pulled ${parts.join(' + ')} from sandbox environment to ${flags.directory}`)

    const syncState = syncStateAction(flags['sync-state'], outputDir, flags.draft)
    if (syncState === 'skip') {
      return
    }

    if (syncState === 'draft') {
      this.warn('Skipped writing .xano/sync_state.json: --draft pulls draft versions, which --fast does not compare against')
      return
    }

    try {
      const tenant = await this.getOrCreateSandbox(profile, flags.verbose)
      if (typeof tenant.created_at !== 'string') {
        this.warn('Could not resolve sandbox fingerprints; skipped writing .xano/sync_state.json')
        return
      }

      const target = sandboxTargetIdentity(instanceHost(profile.instance_origin), {
        created_at: tenant.created_at,
        id: tenant.id,
      })
      const sandboxToken = writeMarkerToken(
        path.dirname(this.getCredentialsPath()),
        target.instance_host,
        target.branch_created_at,
      )
      saveSyncState(outputDir, target, recordEntriesForPaths(outputDir, writtenPaths), {
        replace: true,
        sandboxToken,
      })
    } catch (error) {
      this.warn(`Skipped writing .xano/sync_state.json: ${(error as Error).message}`)
    }
  }
}
