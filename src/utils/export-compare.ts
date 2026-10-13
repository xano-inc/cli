import {buildDocumentKey, type ParsedDocument, parseDocument} from './document-parser.js'

export const ITEMS_BLOCK_REGEX = /^([ \t]*)items\s*=\s*\[[\s\S]*?\n\1\]/m

/**
 * Split a GET /multidoc response into parsed documents, skipping empty or invalid segments.
 */
export function parseExportDocuments(multidoc: string): ParsedDocument[] {
  const documents: ParsedDocument[] = []
  for (const raw of multidoc.split('\n---\n')) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const parsed = parseDocument(trimmed)
    if (parsed) documents.push(parsed)
  }

  return documents
}

/**
 * Reinsert a local table `items = [...]` block when the server export omitted records.
 * If the export already has an items block, the server copy wins.
 */
export function preserveLocalTableRecords(localContent: string, serverContent: string): string {
  if (ITEMS_BLOCK_REGEX.test(serverContent)) {
    return serverContent
  }

  const localMatch = localContent.match(ITEMS_BLOCK_REGEX)
  if (!localMatch) {
    return serverContent
  }

  const lines = serverContent.split('\n')
  let insertIndex = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '}') {
      insertIndex = i
      break
    }
  }

  if (insertIndex === -1) {
    return serverContent
  }

  lines.splice(insertIndex, 0, ...localMatch[0].split('\n'))
  return lines.join('\n')
}

export interface DocumentIndex {
  byGuid: Map<string, string>
  byKey: Map<string, string>
  byKeyLower: Map<string, string>
}

/**
 * Index local files by document key (and GUID) so an export document can be paired
 * with the file it belongs to. Ambiguous case-insensitive keys are marked empty
 * rather than guessed.
 */
export function indexLocalDocuments(
  files: Map<string, string>,
  localContents: Map<string, string>,
): DocumentIndex {
  const byKey = new Map(files)
  const byKeyLower = new Map<string, string>()
  for (const [key, filePath] of files) {
    const lower = key.toLowerCase()
    if (byKeyLower.has(lower) && byKeyLower.get(lower) !== filePath) {
      byKeyLower.set(lower, '')
    } else if (!byKeyLower.has(lower)) {
      byKeyLower.set(lower, filePath)
    }
  }

  const byGuid = new Map<string, string>()
  for (const [filePath, local] of localContents) {
    const parsed = parseDocument(local)
    if (parsed?.guid) byGuid.set(parsed.guid, filePath)
  }

  return {byGuid, byKey, byKeyLower}
}

export function resolveMatchedPath(doc: ParsedDocument, index: DocumentIndex): string | undefined {
  const key = buildDocumentKey(doc.type, doc.name, doc.verb, doc.apiGroup)
  return index.byKey.get(key) || index.byKeyLower.get(key.toLowerCase()) || (doc.guid ? index.byGuid.get(doc.guid) : undefined)
}

export function selectWritebacks(
  exported: ParsedDocument[],
  pushedFiles: Map<string, string>,
  localContents: Map<string, string>,
  options: {includeRecords: boolean},
): Array<{content: string; filePath: string}> {
  const result: Array<{content: string; filePath: string}> = []
  const index = indexLocalDocuments(pushedFiles, localContents)

  for (const doc of exported) {
    const filePath = resolveMatchedPath(doc, index)
    if (!filePath) continue

    const local = localContents.get(filePath) ?? ''
    let {content} = doc
    if (!options.includeRecords && doc.type === 'table') {
      content = preserveLocalTableRecords(local, content)
    }

    if (local.trim() === content.trim()) continue
    result.push({content, filePath})
  }

  return result
}

export interface ExportCompareResult {
  candidates: Array<{content: string; filePath: string; relPath: string}>
  identical: Array<{content: string; filePath: string; relPath: string}>
  serverOnly: ParsedDocument[]
  unmatchedLocal: Array<{content: string; filePath: string; relPath: string}>
}

export function compareLocalToExport(
  localEntries: Array<{content: string; filePath: string; relPath: string}>,
  exported: ParsedDocument[],
): ExportCompareResult {
  const pushedFiles = new Map<string, string>()
  const localContents = new Map<string, string>()
  const byPath = new Map<string, {content: string; filePath: string; relPath: string}>()

  for (const entry of localEntries) {
    const parsed = parseDocument(entry.content)
    if (!parsed) continue
    const key = buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup)
    pushedFiles.set(key, entry.filePath)
    localContents.set(entry.filePath, entry.content)
    byPath.set(entry.filePath, entry)
  }

  const index = indexLocalDocuments(pushedFiles, localContents)
  const matchedLocal = new Set<string>()
  const candidates: ExportCompareResult['candidates'] = []
  const identical: ExportCompareResult['identical'] = []
  const serverOnly: ParsedDocument[] = []

  for (const doc of exported) {
    const filePath = resolveMatchedPath(doc, index)
    if (!filePath) {
      serverOnly.push(doc)
      continue
    }

    matchedLocal.add(filePath)
    const local = byPath.get(filePath)
    if (!local) continue
    if (local.content.trim() === doc.content.trim()) {
      identical.push(local)
    } else {
      candidates.push(local)
    }
  }

  const unmatchedLocal: ExportCompareResult['unmatchedLocal'] = []
  for (const entry of localEntries) {
    if (matchedLocal.has(entry.filePath)) continue
    unmatchedLocal.push(entry)
    candidates.push(entry)
  }

  return {candidates, identical, serverOnly, unmatchedLocal}
}
