export interface ParsedDocument {
  apiGroup?: string
  canonical?: string
  /** Owning channel path for realtime v2 `message` documents. */
  channel?: string
  content: string
  guid?: string
  name: string
  /** Owning realtime_server name for realtime v2 `channel` documents. */
  server?: string
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

  // Extract channel if present (e.g., channel = "rooms/{room_id}").
  // Realtime v2 messages reference their owning channel by PATH, which is what
  // nests them under it on disk.
  let channel: string | undefined
  const channelMatch = content.match(/^\s*channel\s*=\s*"([^"]*)"/m)
  if (channelMatch) {
    channel = channelMatch[1]
  }

  // Extract server if present (e.g., server = "chat").
  // Realtime v2 channels reference their owning realtime_server by NAME, which
  // is what nests them under it on disk (mirrors how a message names its
  // channel via `channel = "..."`).
  let server: string | undefined
  const serverMatch = content.match(/^\s*server\s*=\s*"([^"]*)"/m)
  if (serverMatch) {
    server = serverMatch[1]
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

  return {apiGroup, canonical, channel, content, guid, name, server, type, verb}
}

/**
 * Map a realtime v2 channel path onto directory segments.
 *
 * A channel name IS a path template — "rooms/{room_id}" — so the directory tree
 * mirrors it rather than flattening it. That is the whole reason messages nest
 * under channels: the tree should show the structure, and
 * "channel/rooms/[room_id]/post.xs" says immediately that `post` lives on a
 * parameterized rooms channel.
 *
 *   "rooms"                    -> ["rooms"]
 *   "rooms/{room_id}"          -> ["rooms", "[room_id]"]
 *   "org/{org_id}/room/{id}"   -> ["org", "[org_id]", "room", "[id]"]
 *
 * Braces become brackets because "{" and "}" are awkward in shells, while "["
 * and "]" are legal on every filesystem. They are still glob character classes,
 * so scripting against a checkout needs the path quoted.
 *
 * Escaping the braces rather than dropping them is what keeps a parameterized
 * channel distinct from a literal one: without it, "rooms/{room_id}" and a
 * literal channel named "rooms/room_id" collide on the same directory.
 *
 * Mirrors Vfs::channelSegment() on the server.
 */
export function channelPathSegments(name: string, snakeCaseFn: (s: string) => string): string[] {
  // A parameter keeps the author's name verbatim so it matches the `input`
  // block; only the delimiters are swapped.
  const isParam = /^\{.*\}$/
  return name.split('/').map((segment) => (isParam.test(segment) ? `[${segment.slice(1, -1)}]` : snakeCaseFn(segment)))
}

/**
 * Build a map of realtime v2 channel path -> owning realtime_server name.
 *
 * This is the cross-document lookup the on-disk nesting needs: a `message`
 * document names only its channel (`channel = "..."`), while a `channel`
 * document names its server (`server = "..."`). To place a message under
 * `realtime/server/<server>/channel/<path>/...` we must resolve the message's
 * channel to that channel's server — which only the channel document carries.
 *
 * Because every pull path parses the WHOLE multidoc into memory before writing,
 * we can build this map from the `channel` docs in the same batch (a two-pass
 * resolve), keyed by the channel's own name (its path). A channel with no
 * `server` (e.g. the reserved `_connection` channel, or a pre-server export)
 * simply isn't in the map, and callers fall back accordingly.
 */
export function buildChannelServerResolver(documents: ParsedDocument[]): (channelName: string) => string | undefined {
  const channelToServer = new Map<string, string>()
  for (const doc of documents) {
    if (doc.type === 'channel' && doc.server) {
      channelToServer.set(doc.name, doc.server)
    }
  }

  return (channelName: string): string | undefined => channelToServer.get(channelName)
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
