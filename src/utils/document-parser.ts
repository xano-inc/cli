export interface ParsedDocument {
  apiGroup?: string
  canonical?: string
  content: string
  guid?: string
  name: string
  type: string
  verb?: string
}

/**
 * Parse a single XanoScript document to extract its type, name, and optional verb/api_group.
 * Skips leading comment lines (starting with //) to find the first meaningful line.
 */
export function parseDocument(content: string): null | ParsedDocument {
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

  // Extract canonical if present (e.g., canonical = "abc123")
  let canonical: string | undefined
  const canonicalMatch = content.match(/canonical\s*=\s*"([^"]*)"/)
  if (canonicalMatch) {
    canonical = canonicalMatch[1]
  }

  // Extract guid if present (e.g., guid = "abc123")
  let guid: string | undefined
  const guidMatch = content.match(/guid\s*=\s*"([^"]*)"/)
  if (guidMatch) {
    guid = guidMatch[1]
  }

  return {apiGroup, canonical, content, guid, name, type, verb}
}

/**
 * Build a unique key for a document based on its type, name, verb, and api_group.
 * Used to match server GUID map entries back to local files.
 */
export function buildDocumentKey(type: string, name: string, verb?: string, apiGroup?: string): string {
  const parts = [type, name]
  if (verb) parts.push(verb)
  if (apiGroup) parts.push(apiGroup)
  return parts.join(':')
}

/**
 * Build a map of api_group name → unique folder name for a set of documents.
 *
 * When two api_groups produce the same snakeCase folder (e.g., "Authentication" and
 * "authentication" both → "authentication"), the first group keeps the base name
 * and subsequent groups get a numeric suffix (authentication_2, authentication_3, etc.).
 *
 * @param documents - Parsed documents (only api_group type docs are considered)
 * @param snakeCaseFn - The snakeCase function to use for folder name generation
 * @returns A function that resolves an api_group name to its unique folder name
 */
export function buildApiGroupFolderResolver(
  documents: ParsedDocument[],
  snakeCaseFn: (s: string) => string,
): (groupName: string) => string {
  const apiGroupFolderMap = new Map<string, string>()
  const folderClaims = new Map<string, string[]>()

  for (const doc of documents) {
    if (doc.type !== 'api_group') continue
    const folder = snakeCaseFn(doc.name)
    const names = folderClaims.get(folder) ?? []
    if (!names.includes(doc.name)) {
      names.push(doc.name)
    }

    folderClaims.set(folder, names)
  }

  for (const [folder, names] of folderClaims) {
    apiGroupFolderMap.set(names[0], folder)
    for (let i = 1; i < names.length; i++) {
      apiGroupFolderMap.set(names[i], `${folder}_${i + 1}`)
    }
  }

  return (groupName: string): string => {
    return apiGroupFolderMap.get(groupName) ?? snakeCaseFn(groupName)
  }
}

/**
 * Find local .xs files that contain a specific GUID.
 * Used to surface which files are involved when the server reports a duplicate GUID error.
 */
export function findFilesWithGuid(entries: Array<{content: string; filePath: string}>, guid: string): string[] {
  return entries.filter((e) => e.content.includes(guid)).map((e) => e.filePath)
}
