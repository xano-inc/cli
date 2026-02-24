export interface ParsedDocument {
  apiGroup?: string
  content: string
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

  return {apiGroup, content, name, type, verb}
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
