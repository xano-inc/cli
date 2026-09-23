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

  // Extract realtime_server if present (e.g., realtime_server = "chat").
  // Realtime v2 channels/messages reference their owning realtime_server by NAME
  // via a top-level `realtime_server = "..."`, which is what nests them under it
  // on disk (mirrors how a message names its channel via `channel = "..."`).
  // The keyword is `realtime_server` (renamed from a bare `server` to match the
  // api_group/mcp_server convention — reference the container by its full type).
  let server: string | undefined
  const serverMatch = content.match(/^\s*realtime_server\s*=\s*"([^"]*)"/m)
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
 * document names its channel (`channel = "..."`), while a `channel` document
 * names its server (`realtime_server = "..."`). To place a message under
 * `realtime/server/<server>/channel/<path>/...` we resolve the message's channel
 * to that channel's server — which the channel document carries. (Messages now
 * also carry `realtime_server` directly, but resolving via the channel keeps a
 * single source of truth for the channel→server mapping.)
 *
 * Because every pull path parses the WHOLE multidoc into memory before writing,
 * we can build this map from the `channel` docs in the same batch (a two-pass
 * resolve), keyed by the channel's own name (its path). A channel with no
 * `realtime_server` (e.g. a pre-server export) simply isn't in the map, and
 * callers fall back accordingly.
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
 * Sanitize a document name for use as a single on-disk filename segment.
 * Strips quotes and snake_cases the rest. Mirrors the per-command
 * `sanitizeFilename` the pull commands used to each define privately.
 */
export function sanitizeDocumentName(name: string, snakeCaseFn: (s: string) => string): string {
  return snakeCaseFn(name.replaceAll('"', ''))
}

/**
 * The directory + base filename (no extension, no duplicate suffix) a document
 * is written to on disk. `resolveDocumentPath` returns this; callers append the
 * `.xs` extension and any `_N` duplicate suffix.
 */
export interface DocumentPlacement {
  baseName: string
  typeDir: string
}

/**
 * Resolve where a parsed document lands on disk — the SINGLE source of truth for
 * the pull layout, shared by every pull command (workspace, tenant, release,
 * sandbox, ephemeral). Previously each command inlined a ~130-line copy of this
 * decision; the copies drifted (the realtime v2 realtime_server/channel/message
 * branches existed only in workspace/tenant), so an ephemeral pull dumped v2
 * objects into flat top-level channel/, message/ and realtime_server/ folders —
 * detaching messages from their channels and risking name collisions (message
 * names are unique only WITHIN a channel).
 *
 * @param doc - the parsed document
 * @param outputDir - the resolved pull output root
 * @param deps - injected dependencies
 * @param deps.getApiGroupFolder - resolves an api_group name to its unique folder
 * @param deps.getChannelServer - resolves a v2 channel path to its owning realtime_server
 * @param deps.join - the path.join implementation (injectable for testing)
 * @param deps.snakeCase - the snakeCase implementation the caller uses
 */
export function resolveDocumentPath(
  doc: ParsedDocument,
  outputDir: string,
  deps: {
    getApiGroupFolder: (groupName: string) => string
    getChannelServer: (channelName: string) => string | undefined
    join: (...parts: string[]) => string
    snakeCase: (s: string) => string
  },
): DocumentPlacement {
  const {getApiGroupFolder, getChannelServer, join, snakeCase} = deps
  const sanitize = (name: string): string => sanitizeDocumentName(name, snakeCase)

  if (doc.type === 'workspace') {
    // workspace → workspace/{name}.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'workspace')}
  }

  if (doc.type === 'workspace_trigger' || doc.type === 'error_trigger') {
    // workspace_trigger / error_trigger → workspace/trigger/{name}.xs
    // (error_trigger is a singleton, colocated with workspace triggers)
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'workspace', 'trigger')}
  }

  if (doc.type === 'agent') {
    // agent → ai/agent/{name}.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'ai', 'agent')}
  }

  if (doc.type === 'mcp_server') {
    // mcp_server → ai/mcp_server/{name}.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'ai', 'mcp_server')}
  }

  if (doc.type === 'tool') {
    // tool → ai/tool/{name}.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'ai', 'tool')}
  }

  if (doc.type === 'agent_trigger') {
    // agent_trigger → ai/agent/trigger/{name}.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'ai', 'agent', 'trigger')}
  }

  if (doc.type === 'mcp_server_trigger') {
    // mcp_server_trigger → ai/mcp_server/trigger/{name}.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'ai', 'mcp_server', 'trigger')}
  }

  if (doc.type === 'table_trigger') {
    // table_trigger → table/trigger/{name}.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'table', 'trigger')}
  }

  if (doc.type === 'realtime_channel') {
    // Realtime v1: realtime_channel → realtime/channel/{name}.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'realtime', 'channel')}
  }

  if (doc.type === 'realtime_trigger') {
    // Realtime v1: realtime_trigger → realtime/trigger/{name}.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'realtime', 'trigger')}
  }

  if (doc.type === 'realtime_server_trigger') {
    // Realtime v2. A realtime_server's connect/disconnect trigger. It references its
    // owning server by name via `realtime_server = "..."`, so it nests under that
    // server's folder as `<server>/trigger/`, mirroring how the server's own document
    // and its channels already nest under realtime/server/<server>/ (DEV-7712). Keeping
    // it there means every realtime document stays under realtime/ instead of landing at
    // the output root. A server-less doc (a malformed/legacy export) falls back to a flat
    // realtime/server_trigger/ under realtime/ rather than the repo root.
    return {
      baseName: sanitize(doc.name),
      typeDir: doc.server
        ? join(outputDir, 'realtime', 'server', sanitize(doc.server), 'trigger')
        : join(outputDir, 'realtime', 'server_trigger'),
    }
  }

  if (doc.type === 'channel_trigger') {
    // Realtime v2. A channel's join/leave/deliver trigger. It references BOTH its owning
    // server (`realtime_server = "..."`) and its channel (`channel = "..."`), so it nests
    // beside that channel as `<server>/channel/<channel>/trigger/` — the same path the
    // channel's own document and messages already use (DEV-7712). Falls back gracefully:
    // channel but no resolvable server → the legacy flat channel/<path>/trigger/ layout;
    // neither → realtime/channel_trigger/ under realtime/ (never the output root).
    if (doc.server && doc.channel) {
      return {
        baseName: sanitize(doc.name),
        typeDir: join(outputDir, 'realtime', 'server', sanitize(doc.server), 'channel', snakeCase(doc.channel), 'trigger'),
      }
    }

    if (doc.channel) {
      return {
        baseName: sanitize(doc.name),
        typeDir: join(outputDir, 'channel', ...channelPathSegments(doc.channel, snakeCase), 'trigger'),
      }
    }

    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'realtime', 'channel_trigger')}
  }

  if (doc.type === 'realtime_server') {
    // Realtime v2. The realtime_server is the top-level container that owns
    // channels (which own messages). Its own document is named after itself
    // inside its name directory, mirroring api_group (api/<group>/<group>.xs).
    //   realtime_server "chat" → realtime/server/chat/chat.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'realtime', 'server', sanitize(doc.name))}
  }

  if (doc.type === 'channel') {
    // Realtime v2. The channel owns a directory named after itself (the full
    // channel name, snake_cased into a single flat segment), and its messages
    // live in a message/ subfolder inside it. It nests under its owning
    // realtime_server (from `realtime_server = "..."`):
    //   channel "rooms/{room_id}" (server "chat")
    //     → realtime/server/chat/channel/rooms_room_id/rooms_room_id.xs
    //
    // A channel with no resolvable server (e.g. a pre-server export) falls back
    // to the legacy flat channel/<path>/_channel.xs layout.
    if (doc.server) {
      return {
        baseName: snakeCase(doc.name),
        typeDir: join(outputDir, 'realtime', 'server', sanitize(doc.server), 'channel', snakeCase(doc.name)),
      }
    }

    return {baseName: '_channel', typeDir: join(outputDir, 'channel', ...channelPathSegments(doc.name, snakeCase))}
  }

  if (doc.type === 'message' && doc.channel) {
    // Realtime v2 message → nests in a message/ subfolder under its channel,
    // under that channel's server (resolved via the two-pass channel→server map).
    //   message "post" on channel "rooms/{room_id}" (server "chat")
    //     → realtime/server/chat/channel/rooms_room_id/message/post.xs
    //
    // Nesting matters beyond tidiness: message names are unique only WITHIN a
    // channel, so a flat message/ directory would collide when two channels
    // both define e.g. "say". A channel whose server can't be resolved falls
    // back to the legacy flat channel/ layout.
    const messageServer = getChannelServer(doc.channel)
    return {
      baseName: sanitize(doc.name),
      typeDir: messageServer
        ? join(outputDir, 'realtime', 'server', sanitize(messageServer), 'channel', snakeCase(doc.channel), 'message')
        : join(outputDir, 'channel', ...channelPathSegments(doc.channel, snakeCase)),
    }
  }

  if (doc.type === 'api_group') {
    // api_group "test" → api/{resolved_folder}/{name}.xs
    return {baseName: sanitize(doc.name), typeDir: join(outputDir, 'api', getApiGroupFolder(doc.name))}
  }

  if (doc.type === 'query' && doc.apiGroup) {
    // query in group "test" → api/{resolved_folder}/{folders}/{query_name}[_verb].xs
    const groupFolder = getApiGroupFolder(doc.apiGroup)
    const nameParts = doc.name.split('/')
    const leafName = nameParts.pop()!
    const folderParts = nameParts.map((part) => snakeCase(part))
    const baseName = sanitize(leafName)
    return {
      baseName: doc.verb ? `${baseName}_${doc.verb}` : baseName,
      typeDir: join(outputDir, 'api', groupFolder, ...folderParts),
    }
  }

  // Default: split folder path from name
  const nameParts = doc.name.split('/')
  const leafName = nameParts.pop()!
  const folderParts = nameParts.map((part) => snakeCase(part))
  const baseName = sanitize(leafName)
  return {
    baseName: doc.verb ? `${baseName}_${doc.verb}` : baseName,
    typeDir: join(outputDir, doc.type, ...folderParts),
  }
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

/**
 * Split a multi-document XanoScript blob (documents joined by `\n---\n`) into
 * parsed documents, skipping empties and any fragment that fails to parse.
 *
 * This is the same split the pull commands apply to the server's multidoc
 * response. A hand-authored bundle is one file of many `---`-separated
 * documents; this turns it back into the per-document units every downstream
 * step (placement, GUID writeback, partial-diff matching) assumes.
 */
export function splitMultidoc(blob: string): ParsedDocument[] {
  const documents: ParsedDocument[] = []
  for (const raw of blob.split('\n---\n')) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    const parsed = parseDocument(trimmed)
    if (parsed) documents.push(parsed)
  }

  return documents
}

/** A document's resolved on-disk location relative to the output root, plus its content. */
export interface PlacedDocument {
  content: string
  /** POSIX-style path relative to the output root, e.g. "api/pdf/documents_GET.xs". */
  relPath: string
}

/**
 * Compute where each document lands on disk — a PURE function (no filesystem)
 * mirroring the split-and-place loop the pull commands run. It resolves each
 * document via `resolveDocumentPath`, appends `.xs`, and disambiguates
 * collisions within a directory with a `_N` suffix (the second file named
 * `say.xs` in a dir becomes `say_2.xs`), exactly as the pull writer does.
 *
 * Kept filesystem-free so it can be unit-tested and reused by both the pull
 * commands and `flatten` without duplicating the placement rules.
 */
export function placeDocuments(
  documents: ParsedDocument[],
  deps: {
    join: (...parts: string[]) => string
    relative: (from: string, to: string) => string
    snakeCase: (s: string) => string
  },
): PlacedDocument[] {
  const {join, relative, snakeCase} = deps
  const getApiGroupFolder = buildApiGroupFolderResolver(documents, snakeCase)
  const getChannelServer = buildChannelServerResolver(documents)

  // Per-directory filename counters, so duplicate leaf names get a _N suffix.
  const filenameCounters = new Map<string, Map<string, number>>()
  const placed: PlacedDocument[] = []

  for (const doc of documents) {
    const {baseName, typeDir} = resolveDocumentPath(doc, '', {
      getApiGroupFolder,
      getChannelServer,
      join,
      snakeCase,
    })

    const dirKey = typeDir
    if (!filenameCounters.has(dirKey)) filenameCounters.set(dirKey, new Map())
    const typeCounters = filenameCounters.get(dirKey)!
    const count = typeCounters.get(baseName) || 0
    typeCounters.set(baseName, count + 1)

    const filename = count === 0 ? `${baseName}.xs` : `${baseName}_${count + 1}.xs`
    const abs = join(typeDir, filename)
    // typeDir was built off an empty root, so `abs` is already root-relative;
    // normalize any leading separator via relative() for a clean POSIX path.
    const relPath = relative('', abs)
    placed.push({content: doc.content, relPath})
  }

  return placed
}
