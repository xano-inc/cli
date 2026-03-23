import {Args, Flags} from '@oclif/core'

import snakeCase from 'lodash.snakecase'

import BaseCommand from '../../../base-command.js'
import {buildApiGroupFolderResolver, type ParsedDocument, parseDocument} from '../../../utils/document-parser.js'

import * as fs from 'node:fs'
import * as path from 'node:path'

export default class EphemeralPull extends BaseCommand {
  static args = {
    directory: Args.string({
      description: 'Output directory for pulled documents',
      required: true,
    }),
  }
  static override description = 'Pull an ephemeral tenant multidoc and split into individual files'
  static override examples = [
    `$ xano ephemeral pull ./my-tenant -t my-tenant
Pulled 42 documents from ephemeral tenant my-tenant to ./my-tenant
`,
    `$ xano ephemeral pull ./backup -t my-tenant --env --records`,
  ]
  static override flags = {
    ...BaseCommand.baseFlags,
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
      description: 'Ephemeral tenant name to pull from',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(EphemeralPull)

    const profileName = flags.profile || this.getDefaultProfile()
    const credentials = this.loadCredentialsFile()

    if (!credentials || !(profileName in credentials.profiles)) {
      this.error(`Profile '${profileName}' not found.\n` + `Create a profile using 'xano profile create'`)
    }

    const profile = credentials.profiles[profileName]

    if (!profile.instance_origin) {
      this.error(`Profile '${profileName}' is missing instance_origin`)
    }

    if (!profile.access_token) {
      this.error(`Profile '${profileName}' is missing access_token`)
    }

    const tenantName = flags.tenant

    const queryParams = new URLSearchParams({
      env: flags.env.toString(),
      include_draft: flags.draft.toString(),
      records: flags.records.toString(),
    })

    const apiUrl = `${profile.instance_origin}/api:meta/ephemeral/tenant/${tenantName}/multidoc?${queryParams.toString()}`

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
      return
    }

    const outputDir = path.resolve(args.directory)
    fs.mkdirSync(outputDir, {recursive: true})

    const getApiGroupFolder = buildApiGroupFolderResolver(documents, snakeCase)

    const filenameCounters: Map<string, Map<string, number>> = new Map()

    let writtenCount = 0
    for (const doc of documents) {
      let typeDir: string
      let baseName: string

      if (doc.type === 'workspace') {
        typeDir = path.join(outputDir, 'workspace')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'workspace_trigger') {
        typeDir = path.join(outputDir, 'workspace', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'agent') {
        typeDir = path.join(outputDir, 'ai', 'agent')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'mcp_server') {
        typeDir = path.join(outputDir, 'ai', 'mcp_server')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'tool') {
        typeDir = path.join(outputDir, 'ai', 'tool')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'agent_trigger') {
        typeDir = path.join(outputDir, 'ai', 'agent', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'mcp_server_trigger') {
        typeDir = path.join(outputDir, 'ai', 'mcp_server', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'table_trigger') {
        typeDir = path.join(outputDir, 'table', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'realtime_channel') {
        typeDir = path.join(outputDir, 'realtime', 'channel')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'realtime_trigger') {
        typeDir = path.join(outputDir, 'realtime', 'trigger')
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'api_group') {
        const groupFolder = getApiGroupFolder(doc.name)
        typeDir = path.join(outputDir, 'api', groupFolder)
        baseName = this.sanitizeFilename(doc.name)
      } else if (doc.type === 'query' && doc.apiGroup) {
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

      const dirKey = path.relative(outputDir, typeDir)
      if (!filenameCounters.has(dirKey)) {
        filenameCounters.set(dirKey, new Map())
      }

      const typeCounters = filenameCounters.get(dirKey)!
      const count = typeCounters.get(baseName) || 0
      typeCounters.set(baseName, count + 1)

      let filename: string
      filename = count === 0 ? `${baseName}.xs` : `${baseName}_${count + 1}.xs`

      const filePath = path.join(typeDir, filename)
      fs.writeFileSync(filePath, doc.content, 'utf8')
      writtenCount++
    }

    this.log(`Pulled ${writtenCount} documents from ephemeral tenant ${tenantName} to ${args.directory}`)
  }

  private sanitizeFilename(name: string): string {
    return snakeCase(name.replaceAll('"', ''))
  }
}
