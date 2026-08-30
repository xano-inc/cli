import snakeCase from 'lodash.snakecase'
import {join} from 'node:path'

import type {ParsedDocument} from './document-parser.js'

/**
 * Resolve the on-disk output directory and base filename for a pulled XanoScript
 * document, mapping its `doc.type` to the canonical pull folder layout.
 *
 * This is the single source of truth for the pull file-tree layout, shared by every
 * pull command (`workspace pull`, `sandbox pull`, `tenant pull`, `release pull`, and
 * `workspace git pull`). Registering a new document type here maps it consistently
 * across all of them — the same dispatch was previously duplicated verbatim in five
 * places, so a new type had to be added to each, a recurring source of drift.
 *
 * Pure: `sanitize` (a filename sanitizer) and `getApiGroupFolder` (an api_group name →
 * folder resolver) are injected, so the function has no dependency on a command instance
 * and is directly unit-testable.
 *
 * @param outputDir Root directory the pulled tree is written under.
 * @param doc The parsed document; its `type`/`name`/`verb`/`apiGroup` drive the layout.
 * @param getApiGroupFolder Resolves an api_group name to its (collision-disambiguated) folder.
 * @param sanitize Sanitizes a document name into a safe base filename.
 * @returns `typeDir` (the folder under `outputDir`) and `baseName` (filename without `.xs`).
 */
export function resolveDocumentOutputPath(
  outputDir: string,
  doc: ParsedDocument,
  getApiGroupFolder: (name: string) => string,
  sanitize: (name: string) => string,
): {baseName: string; typeDir: string} {
  let typeDir: string
  let baseName: string

  // Kept as an if/else chain (not a switch) because the `query` case branches on a second
  // condition (`doc.apiGroup`) and otherwise falls through to the default — a switch cannot
  // express that fall-through without a deliberate `no-fallthrough`. This dispatch is a
  // byte-for-byte extraction of the logic the five pull commands previously each inlined.
  // eslint-disable-next-line unicorn/prefer-switch
  if (doc.type === 'workspace') {
    // workspace → workspace/{name}.xs
    typeDir = join(outputDir, 'workspace')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'workspace_trigger') {
    // workspace_trigger → workspace/trigger/{name}.xs
    typeDir = join(outputDir, 'workspace', 'trigger')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'error_trigger') {
    // error_trigger → workspace/trigger/{name}.xs (singleton, colocated with workspace triggers)
    typeDir = join(outputDir, 'workspace', 'trigger')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'agent') {
    // agent → ai/agent/{name}.xs
    typeDir = join(outputDir, 'ai', 'agent')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'mcp_server') {
    // mcp_server → ai/mcp_server/{name}.xs
    typeDir = join(outputDir, 'ai', 'mcp_server')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'tool') {
    // tool → ai/tool/{name}.xs
    typeDir = join(outputDir, 'ai', 'tool')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'agent_trigger') {
    // agent_trigger → ai/agent/trigger/{name}.xs
    typeDir = join(outputDir, 'ai', 'agent', 'trigger')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'mcp_server_trigger') {
    // mcp_server_trigger → ai/mcp_server/trigger/{name}.xs
    typeDir = join(outputDir, 'ai', 'mcp_server', 'trigger')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'table_trigger') {
    // table_trigger → table/trigger/{name}.xs
    typeDir = join(outputDir, 'table', 'trigger')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'realtime_channel') {
    // realtime_channel → realtime/channel/{name}.xs
    typeDir = join(outputDir, 'realtime', 'channel')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'realtime_trigger') {
    // realtime_trigger → realtime/trigger/{name}.xs
    typeDir = join(outputDir, 'realtime', 'trigger')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'channel_trigger') {
    // channel_trigger → realtime/channel/trigger/{name}.xs
    // A channel's join/leave trigger colocates under its parent channel folder, matching the
    // established `<parent>/trigger/` convention (e.g. agent_trigger → ai/agent/trigger). DEV-7712.
    typeDir = join(outputDir, 'realtime', 'channel', 'trigger')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'realtime_server_trigger') {
    // realtime_server_trigger → realtime/server/trigger/{name}.xs
    // A realtime server's connect/disconnect trigger colocates under its parent server folder,
    // keeping every realtime document under realtime/. DEV-7712.
    typeDir = join(outputDir, 'realtime', 'server', 'trigger')
    baseName = sanitize(doc.name)
  } else if (doc.type === 'api_group') {
    // api_group "test" → api/{resolved_folder}/{name}.xs
    const groupFolder = getApiGroupFolder(doc.name)
    typeDir = join(outputDir, 'api', groupFolder)
    baseName = sanitize(doc.name)
  } else if (doc.type === 'query' && doc.apiGroup) {
    // query in group "test" → api/{resolved_folder}/{query_name}.xs
    const groupFolder = getApiGroupFolder(doc.apiGroup)
    const nameParts = doc.name.split('/')
    const leafName = nameParts.pop()!
    const folderParts = nameParts.map((part) => snakeCase(part))
    typeDir = join(outputDir, 'api', groupFolder, ...folderParts)
    baseName = sanitize(leafName)
    if (doc.verb) {
      baseName = `${baseName}_${doc.verb}`
    }
  } else {
    // Default: split folder path from name
    const nameParts = doc.name.split('/')
    const leafName = nameParts.pop()!
    const folderParts = nameParts.map((part) => snakeCase(part))
    typeDir = join(outputDir, doc.type, ...folderParts)
    baseName = sanitize(leafName)
    if (doc.verb) {
      baseName = `${baseName}_${doc.verb}`
    }
  }

  return {baseName, typeDir}
}
