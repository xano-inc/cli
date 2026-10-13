import {createHash} from 'node:crypto'
import * as fs from 'node:fs'
import {join, relative} from 'node:path'

import {buildDocumentKey, parseDocument} from './document-parser.js'

export const SYNC_STATE_VERSION = 1
export const SYNC_STATE_DIR = '.xano'
export const SYNC_STATE_FILENAME = 'sync_state.json'

export interface SyncFileEntry {
  id?: number
  key: string
  sha256: string
}

export interface SyncTargetIdentity {
  branch: string
  branch_created_at: string
  instance_host: string
  workspace_created_at: string
  workspace_id: string
}

export interface SyncTargetState extends SyncTargetIdentity {
  files: Record<string, SyncFileEntry>
  sandbox_token?: string
}

export interface SyncStateFile {
  targets: SyncTargetState[]
  version: number
}

export interface LocalFileHash {
  relPath: string
  sha256: string
}

export interface CandidateResult {
  candidates: LocalFileHash[]
  deletedLocally: Array<{key: string; relPath: string}>
  unchanged: LocalFileHash[]
}

export type MetaGet = (pathname: string) => Promise<unknown>

const TEMP_PREFIX = `${SYNC_STATE_FILENAME}.tmp-`

export function instanceHost(instanceOrigin: string): string {
  return new URL(instanceOrigin).host.toLowerCase()
}

export function toRelPath(dir: string, filePath: string): string {
  return relative(dir, filePath).split('\\').join('/')
}

export function hashBytes(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function hashFile(filePath: string): string {
  return hashBytes(fs.readFileSync(filePath))
}

export function syncStatePath(dir: string): string {
  return join(dir, SYNC_STATE_DIR, SYNC_STATE_FILENAME)
}

export function syncStateExists(dir: string): boolean {
  return fs.existsSync(syncStatePath(dir))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFileEntry(value: unknown): null | SyncFileEntry {
  if (!isRecord(value)) return null
  if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(value.sha256)) return null
  if (typeof value.key !== 'string' || value.key.length === 0) return null
  const entry: SyncFileEntry = {key: value.key, sha256: value.sha256.toLowerCase()}
  if (typeof value.id === 'number' && Number.isInteger(value.id)) {
    entry.id = value.id
  }

  return entry
}

function parseTarget(value: unknown): null | SyncTargetState {
  if (!isRecord(value)) return null
  if (typeof value.instance_host !== 'string' || value.instance_host.length === 0) return null
  if (typeof value.workspace_id !== 'string') return null
  if (typeof value.branch !== 'string' || value.branch.length === 0) return null
  if (typeof value.branch_created_at !== 'string') return null
  if (typeof value.workspace_created_at !== 'string') return null
  if (!isRecord(value.files)) return null

  const files: Record<string, SyncFileEntry> = {}
  for (const [path, raw] of Object.entries(value.files)) {
    const entry = parseFileEntry(raw)
    if (!entry) return null
    files[path] = entry
  }

  const target: SyncTargetState = {
    branch: value.branch,
    branch_created_at: value.branch_created_at,
    files,
    instance_host: value.instance_host,
    workspace_created_at: value.workspace_created_at,
    workspace_id: value.workspace_id,
  }
  if (typeof value.sandbox_token === 'string' && value.sandbox_token.length > 0) {
    target.sandbox_token = value.sandbox_token
  }

  return target
}

export function recordEntriesForPaths(dir: string, filePaths: string[]): Record<string, SyncFileEntry> {
  const entries: Record<string, SyncFileEntry> = {}
  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = parseDocument(content)
      if (!parsed) continue
      entries[toRelPath(dir, filePath)] = {
        key: buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup),
        sha256: hashFile(filePath),
      }
    } catch {
      // Skip unreadable files.
    }
  }

  return entries
}

export function sandboxTargetIdentity(
  host: string,
  tenant: {created_at: string; id: number},
): SyncTargetIdentity {
  return {
    branch: 'sandbox',
    branch_created_at: String(tenant.id),
    instance_host: host,
    workspace_created_at: tenant.created_at,
    workspace_id: 'sandbox',
  }
}

function parseSyncStateFile(raw: unknown): null | SyncStateFile {
  if (!isRecord(raw)) return null
  if (raw.version !== SYNC_STATE_VERSION) return null
  if (!Array.isArray(raw.targets)) return null
  const targets: SyncTargetState[] = []
  for (const item of raw.targets) {
    const parsed = parseTarget(item)
    if (!parsed) return null
    targets.push(parsed)
  }

  return {targets, version: SYNC_STATE_VERSION}
}

export function sameTargetIdentity(a: SyncTargetIdentity, b: SyncTargetIdentity): boolean {
  return (
    a.instance_host === b.instance_host &&
    a.workspace_id === b.workspace_id &&
    a.branch === b.branch
  )
}

export function sameTargetFingerprints(a: SyncTargetIdentity, b: SyncTargetIdentity): boolean {
  return (
    sameTargetIdentity(a, b) &&
    a.branch_created_at === b.branch_created_at &&
    a.workspace_created_at === b.workspace_created_at
  )
}

export function readSyncStateFile(
  dir: string,
  warn?: (message: string) => void,
): null | SyncStateFile {
  const filePath = syncStatePath(dir)
  if (!fs.existsSync(filePath)) return null

  let text: string
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch {
    warn?.('Could not read .xano/sync_state.json; treating it as missing')
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    warn?.('.xano/sync_state.json is not valid JSON; treating it as missing')
    return null
  }

  const file = parseSyncStateFile(parsed)
  if (!file) {
    warn?.('.xano/sync_state.json is invalid or from an unknown version; treating it as missing')
    return null
  }

  return file
}

export function loadSyncState(
  dir: string,
  target: SyncTargetIdentity,
  warn?: (message: string) => void,
): null | SyncTargetState {
  const file = readSyncStateFile(dir, warn)
  if (!file) return null
  return file.targets.find((candidate) => sameTargetFingerprints(candidate, target)) ?? null
}

function itemsOf(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (isRecord(data) && Array.isArray(data.items)) return data.items
  return []
}

export interface ResolvedTarget extends SyncTargetIdentity {
  live_branch: string
}

export async function resolveTarget(
  instanceOrigin: string,
  workspaceId: string,
  branch: string,
  fetchJson: MetaGet,
): Promise<null | ResolvedTarget> {
  let host: string
  try {
    host = instanceHost(instanceOrigin)
  } catch {
    return null
  }

  let workspace: unknown
  let branches: unknown
  try {
    ;[workspace, branches] = await Promise.all([
      fetchJson(`/workspace/${workspaceId}`),
      fetchJson(`/workspace/${workspaceId}/branch`),
    ])
  } catch {
    return null
  }

  if (!isRecord(workspace) || typeof workspace.created_at !== 'string') {
    return null
  }

  const branchItems = itemsOf(branches).filter((item) => isRecord(item))
  if (branchItems.length === 0) return null

  const requested = branch.trim()
  const live = branchItems.find((item) => item.live === true)
  const match = requested
    ? branchItems.find((item) => item.label === requested)
    : live

  if (
    !match ||
    typeof match.label !== 'string' ||
    typeof match.created_at !== 'string' ||
    !live ||
    typeof live.label !== 'string'
  ) {
    return null
  }

  return {
    branch: match.label,
    branch_created_at: match.created_at,
    instance_host: host,
    live_branch: live.label,
    workspace_created_at: workspace.created_at,
    workspace_id: String(workspaceId),
  }
}

export function computeCandidates(files: LocalFileHash[], state: null | SyncTargetState): CandidateResult {
  const local = new Map(files.map((file) => [file.relPath, file]))
  const candidates: LocalFileHash[] = []
  const unchanged: LocalFileHash[] = []

  for (const file of files) {
    const recorded = state?.files[file.relPath]
    if (!recorded || recorded.sha256 !== file.sha256) {
      candidates.push(file)
    } else {
      unchanged.push(file)
    }
  }

  const deletedLocally: Array<{key: string; relPath: string}> = []
  if (state) {
    for (const [relPath, entry] of Object.entries(state.files)) {
      if (!local.has(relPath)) {
        deletedLocally.push({key: entry.key, relPath})
      }
    }
  }

  return {candidates, deletedLocally, unchanged}
}

export function recordFiles(state: SyncTargetState, entries: Record<string, SyncFileEntry>): SyncTargetState {
  return {
    ...state,
    files: mergeFileEntries(state.files, entries),
  }
}

function mergeFileEntries(
  existing: Record<string, SyncFileEntry>,
  incoming: Record<string, SyncFileEntry>,
): Record<string, SyncFileEntry> {
  const files = {...existing}
  for (const [relPath, entry] of Object.entries(incoming)) {
    const previous = files[relPath]
    if (previous && previous.key === entry.key && entry.id === undefined && previous.id !== undefined) {
      files[relPath] = {...entry, id: previous.id}
    } else {
      files[relPath] = entry.id === undefined ? {key: entry.key, sha256: entry.sha256} : {...entry}
    }
  }

  return files
}

function cleanupTempFiles(dir: string, keep?: string): void {
  let names: string[] = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return
  }

  for (const name of names) {
    if (!name.startsWith(TEMP_PREFIX)) continue
    const full = join(dir, name)
    if (keep && full === keep) continue
    try {
      fs.unlinkSync(full)
    } catch {
      // Best-effort cleanup.
    }
  }
}

export function saveSyncState(
  dir: string,
  target: SyncTargetIdentity,
  entries: Record<string, SyncFileEntry>,
  options: {pruneMissing?: boolean; replace?: boolean; sandboxToken?: string} = {},
): void {
  const stateDir = join(dir, SYNC_STATE_DIR)
  fs.mkdirSync(stateDir, {recursive: true})

  const existing = readSyncStateFile(dir)
  const targets = existing?.targets ? [...existing.targets] : []
  const index = targets.findIndex((candidate) => sameTargetIdentity(candidate, target))

  const nextFiles: Record<string, SyncFileEntry> =
    index === -1 || options.replace || !sameTargetFingerprints(targets[index], target)
      ? {...entries}
      : mergeFileEntries(targets[index].files, entries)

  if (options.pruneMissing) {
    for (const relPath of Object.keys(nextFiles)) {
      if (!fs.existsSync(join(dir, relPath))) {
        delete nextFiles[relPath]
      }
    }
  }

  const keepToken =
    index !== -1 && sameTargetFingerprints(targets[index], target) ? targets[index].sandbox_token : undefined
  const sandboxToken = options.sandboxToken ?? keepToken
  const nextTarget: SyncTargetState = {
    branch: target.branch,
    branch_created_at: target.branch_created_at,
    files: nextFiles,
    instance_host: target.instance_host,
    workspace_created_at: target.workspace_created_at,
    workspace_id: target.workspace_id,
  }
  if (sandboxToken) {
    nextTarget.sandbox_token = sandboxToken
  }

  if (index === -1) {
    targets.push(nextTarget)
  } else {
    targets[index] = nextTarget
  }

  const payload: SyncStateFile = {targets, version: SYNC_STATE_VERSION}
  const dest = syncStatePath(dir)
  const tmp = join(stateDir, `${TEMP_PREFIX}${process.pid}`)

  try {
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    fs.renameSync(tmp, dest)
  } catch (error) {
    try {
      fs.unlinkSync(tmp)
    } catch {
      // Already gone.
    }

    throw error
  } finally {
    cleanupTempFiles(stateDir)
  }
}

export function listSyncDir(dir: string): string[] {
  const stateDir = join(dir, SYNC_STATE_DIR)
  if (!fs.existsSync(stateDir)) return []
  return fs.readdirSync(stateDir)
}
