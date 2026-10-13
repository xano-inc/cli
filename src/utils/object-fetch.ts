import {mapWithConcurrency} from './concurrency.js'
import {buildDocumentKey, parseDocument} from './document-parser.js'
import {normalizeListResponse} from './paging.js'
import {type SyncFileEntry, type SyncTargetIdentity, type SyncTargetState} from './sync-state.js'

export const PER_OBJECT_FETCH_LIMIT = 25
export const PER_OBJECT_CONCURRENCY = 6

export type ObjectType = 'addon' | 'agent' | 'function' | 'query' | 'table' | 'task' | 'tool'

export interface TypeSpec {
  hasBranchField: boolean
  listPath: (workspaceId: string, extra?: {groupId?: number}) => string
  objectPath: (workspaceId: string, id: number, extra?: {groupId?: number}) => string
}

export const OBJECT_TYPE_SPECS: Record<ObjectType, TypeSpec> = {
  addon: {
    hasBranchField: true,
    listPath: (workspaceId) => `/workspace/${workspaceId}/addon`,
    objectPath: (workspaceId, id) => `/workspace/${workspaceId}/addon/${id}`,
  },
  agent: {
    hasBranchField: false,
    listPath: (workspaceId) => `/workspace/${workspaceId}/agent`,
    objectPath: (workspaceId, id) => `/workspace/${workspaceId}/agent/${id}`,
  },
  function: {
    hasBranchField: true,
    listPath: (workspaceId) => `/workspace/${workspaceId}/function`,
    objectPath: (workspaceId, id) => `/workspace/${workspaceId}/function/${id}`,
  },
  query: {
    hasBranchField: false,
    listPath: (workspaceId, extra) =>
      extra?.groupId === undefined
        ? `/workspace/${workspaceId}/apigroup`
        : `/workspace/${workspaceId}/apigroup/${extra.groupId}/api`,
    objectPath: (workspaceId, id, extra) => `/workspace/${workspaceId}/apigroup/${extra?.groupId}/api/${id}`,
  },
  table: {
    hasBranchField: false,
    listPath: (workspaceId) => `/workspace/${workspaceId}/table`,
    objectPath: (workspaceId, id) => `/workspace/${workspaceId}/table/${id}`,
  },
  task: {
    hasBranchField: true,
    listPath: (workspaceId) => `/workspace/${workspaceId}/task`,
    objectPath: (workspaceId, id) => `/workspace/${workspaceId}/task/${id}`,
  },
  tool: {
    hasBranchField: true,
    listPath: (workspaceId) => `/workspace/${workspaceId}/tool`,
    objectPath: (workspaceId, id) => `/workspace/${workspaceId}/tool/${id}`,
  },
}

const GUID_REGEX = /guid\s*=\s*(["'])([^"']*)\1/

export function isObjectType(type: string): type is ObjectType {
  return type in OBJECT_TYPE_SPECS
}

export function typesWithoutBranchField(types: string[]): string[] {
  return types.filter((type) => isObjectType(type) && !OBJECT_TYPE_SPECS[type].hasBranchField)
}

/**
 * Insert a guid line before the final `}`, matching `syncGuidToFile`.
 * A blank line is inserted before it when the previous non-empty line is a
 * closing `}` or `]` (the multidoc export's layout, measured in Phase 0b).
 */
export function insertGuidLine(content: string, guid: string): string {
  if (GUID_REGEX.test(content)) {
    return content.replace(GUID_REGEX, `guid = "${guid}"`)
  }

  const lines = content.split('\n')
  let insertIndex = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '}') {
      insertIndex = i
      break
    }
  }

  if (insertIndex === -1) return content

  let indent = '  '
  let previousNonEmpty = ''
  for (let i = insertIndex - 1; i >= 0; i--) {
    if (lines[i].trim()) {
      previousNonEmpty = lines[i].trim()
      const indentMatch = lines[i].match(/^(\s+)/)
      if (indentMatch) indent = indentMatch[1]
      break
    }
  }

  const guidLine = `${indent}guid = "${guid}"`
  if (previousNonEmpty === '}' || previousNonEmpty === ']') {
    lines.splice(insertIndex, 0, '', guidLine)
  } else {
    lines.splice(insertIndex, 0, guidLine)
  }

  return lines.join('\n')
}

export function restoreGuidFromLocal(remoteContent: string, localContent: string): string {
  const localGuid = localContent.match(GUID_REGEX)
  if (!localGuid) return remoteContent
  if (GUID_REGEX.test(remoteContent)) return remoteContent
  return insertGuidLine(remoteContent, localGuid[2])
}

export function readXanoscript(body: unknown): {branch?: string; status: string; text: string} | {error: string} {
  if (!body || typeof body !== 'object') return {error: 'response is not an object'}
  const record = body as Record<string, unknown>
  const xs = record.xanoscript
  if (!xs || typeof xs !== 'object') return {error: 'xanoscript is missing'}
  const script = xs as Record<string, unknown>
  if (script.status !== 'ok' || typeof script.value !== 'string') {
    return {error: `xanoscript.status is ${String(script.status)}`}
  }

  return {
    branch: typeof record.branch === 'string' ? record.branch : undefined,
    status: 'ok',
    text: script.value,
  }
}

export interface ResolvedObjectId {
  groupId?: number
  id: number
}

export type ObjectGet = (pathname: string, query?: Record<string, string>) => Promise<{json: unknown; ok: boolean; status: number}>

function itemsOf(json: unknown): Array<Record<string, unknown>> {
  try {
    return normalizeListResponse<Record<string, unknown>>(json, [
      'functions',
      'tables',
      'tasks',
      'agents',
      'tools',
      'addons',
      'apigroups',
      'apis',
    ]).items.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
  } catch {
    return []
  }
}

async function searchExact(
  get: ObjectGet,
  pathname: string,
  name: string,
  extraMatch?: (item: Record<string, unknown>) => boolean,
): Promise<null | Record<string, unknown>> {
  const response = await get(pathname, {include_draft: 'false', page: '1', per_page: '50', search: name})
  if (!response.ok) return null
  const matches = itemsOf(response.json).filter((item) => item.name === name && (extraMatch ? extraMatch(item) : true))
  if (matches.length !== 1 || typeof matches[0].id !== 'number') return null
  return matches[0]
}

export async function lookupObjectId(
  get: ObjectGet,
  workspaceId: string,
  parsed: {apiGroup?: string; name: string; type: string; verb?: string},
): Promise<null | ResolvedObjectId> {
  if (!isObjectType(parsed.type)) return null
  const spec = OBJECT_TYPE_SPECS[parsed.type]

  if (parsed.type === 'query') {
    if (!parsed.apiGroup) return null
    const group = await searchExact(get, spec.listPath(workspaceId), parsed.apiGroup)
    if (!group || typeof group.id !== 'number') return null
    const verb = parsed.verb ? String(parsed.verb).toUpperCase() : undefined
    const api = await searchExact(get, spec.listPath(workspaceId, {groupId: group.id}), parsed.name, (item) =>
      verb ? String(item.verb ?? '').toUpperCase() === verb : true,
    )
    if (!api || typeof api.id !== 'number') return null
    return {groupId: group.id, id: api.id}
  }

  const found = await searchExact(get, spec.listPath(workspaceId), parsed.name)
  if (!found || typeof found.id !== 'number') return null
  return {id: found.id}
}

export interface PushedObject {
  content: string
  filePath: string
  relPath: string
}

export interface FetchFormattedResult {
  content: string
  filePath: string
  id: number
  relPath: string
}

export type FetchFormattedFailure = {error: string; filePath: string}

export function canUsePerObjectFetch(args: {
  isLiveBranch: boolean
  limit?: number
  pushed: PushedObject[]
}): {ok: false; reason: string} | {ok: true} {
  const limit = args.limit ?? PER_OBJECT_FETCH_LIMIT
  if (args.pushed.length === 0) return {ok: false, reason: 'no pushed documents'}
  if (args.pushed.length > limit) {
    return {ok: false, reason: `push has ${args.pushed.length} documents (limit ${limit})`}
  }

  const types = new Set<string>()
  for (const entry of args.pushed) {
    const parsed = parseDocument(entry.content)
    if (!parsed || !isObjectType(parsed.type)) {
      return {ok: false, reason: `type ${parsed?.type ?? 'unknown'} is not in the per-object table`}
    }

    types.add(parsed.type)
  }

  if (!args.isLiveBranch) {
    const missing = typesWithoutBranchField([...types])
    if (missing.length > 0) {
      return {ok: false, reason: `types without a branch field on a non-live branch: ${missing.join(', ')}`}
    }
  }

  return {ok: true}
}

export async function fetchFormattedObjects(args: {
  get: ObjectGet
  isLiveBranch: boolean
  limit?: number
  pushed: PushedObject[]
  state: null | SyncTargetState
  target: SyncTargetIdentity
  workspaceId: string
}): Promise<{ids: Record<string, SyncFileEntry>; ok: true; results: FetchFormattedResult[];} | {ok: false; reason: string}> {
  const gate = canUsePerObjectFetch({isLiveBranch: args.isLiveBranch, limit: args.limit, pushed: args.pushed})
  if (!gate.ok) return gate

  const ids: Record<string, SyncFileEntry> = {}
  const resolved: Array<PushedObject & {groupId?: number; id: number; key: string}> = []

  for (const entry of args.pushed) {
    const parsed = parseDocument(entry.content)
    if (!parsed || !isObjectType(parsed.type)) {
      return {ok: false, reason: `unparseable document ${entry.relPath}`}
    }

    const key = buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup)
    const recorded = args.state?.files[entry.relPath]
    let id: number | undefined
    let groupId: number | undefined
    const cachedId = recorded?.id !== undefined && recorded.key === key ? recorded.id : undefined
    if (parsed.type === 'query' || cachedId === undefined) {
      // Sequential: stop on the first miss instead of firing every lookup.
      // eslint-disable-next-line no-await-in-loop
      const lookedUp = await lookupObjectId(args.get, args.workspaceId, parsed)
      if (!lookedUp) return {ok: false, reason: `could not look up id for ${entry.relPath}`}
      id = cachedId ?? lookedUp.id
      groupId = lookedUp.groupId
    } else {
      id = cachedId
    }

    resolved.push({...entry, groupId, id, key})
  }

  const fetched = await mapWithConcurrency(resolved, PER_OBJECT_CONCURRENCY, async (entry) => {
    const parsed = parseDocument(entry.content)!
    const spec = OBJECT_TYPE_SPECS[parsed.type as ObjectType]
    const pathname = spec.objectPath(args.workspaceId, entry.id, {groupId: entry.groupId})
    const response = await args.get(pathname, {include_draft: 'false', include_xanoscript: 'true'})
    if (!response.ok) {
      return {error: `HTTP ${response.status} for ${entry.relPath}`, filePath: entry.filePath} satisfies FetchFormattedFailure
    }

    const xs = readXanoscript(response.json)
    if ('error' in xs) {
      return {error: `${entry.relPath}: ${xs.error}`, filePath: entry.filePath} satisfies FetchFormattedFailure
    }

    if (spec.hasBranchField && xs.branch !== args.target.branch) {
        return {
          error: `${entry.relPath}: branch ${xs.branch ?? '(missing)'} != ${args.target.branch}`,
          filePath: entry.filePath,
        } satisfies FetchFormattedFailure
      }

    const restored = restoreGuidFromLocal(xs.text, entry.content)
    const restoredParsed = parseDocument(restored)
    if (!restoredParsed) {
      return {error: `${entry.relPath}: fetched document did not parse`, filePath: entry.filePath} satisfies FetchFormattedFailure
    }

    const restoredKey = buildDocumentKey(
      restoredParsed.type,
      restoredParsed.name,
      restoredParsed.verb,
      restoredParsed.apiGroup,
    )
    if (restoredKey !== entry.key) {
      return {error: `${entry.relPath}: fetched key ${restoredKey} != ${entry.key}`, filePath: entry.filePath} satisfies FetchFormattedFailure
    }

    return {
      content: restored,
      filePath: entry.filePath,
      id: entry.id,
      relPath: entry.relPath,
    } satisfies FetchFormattedResult
  })

  const results: FetchFormattedResult[] = []
  for (const item of fetched) {
    if ('error' in item) {
      return {ok: false, reason: item.error ?? 'unknown fetch error'}
    }

    results.push(item)
  }

  for (const entry of resolved) {
    ids[entry.relPath] = {
      id: entry.id,
      key: entry.key,
      sha256: '',
    }
  }

  return {ids, ok: true, results}
}
