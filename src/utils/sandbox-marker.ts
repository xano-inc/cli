import {randomUUID} from 'node:crypto'
import * as fs from 'node:fs'
import {join} from 'node:path'

import {instanceHost} from './sync-state.js'

export const SANDBOX_MARKER_VERSION = 1
export const SANDBOX_MARKER_FILENAME = 'sandbox_sync.json'

const TEMP_PREFIX = `${SANDBOX_MARKER_FILENAME}.tmp-`

interface MarkerEntry {
  token: string
}

interface MarkerFile {
  sandboxes: Record<string, MarkerEntry>
  version: number
}

export function sandboxMarkerPath(dir: string): string {
  return join(dir, SANDBOX_MARKER_FILENAME)
}

export function sandboxMarkerExists(dir: string): boolean {
  return fs.existsSync(sandboxMarkerPath(dir))
}

export function sandboxMarkerKey(host: string, tenantId: number | string): string {
  return `${host}#${tenantId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMarkerFile(raw: unknown): MarkerFile | null {
  if (!isRecord(raw)) return null
  if (raw.version !== SANDBOX_MARKER_VERSION) return null
  if (!isRecord(raw.sandboxes)) return null

  const sandboxes: Record<string, MarkerEntry> = {}
  for (const [key, value] of Object.entries(raw.sandboxes)) {
    if (!isRecord(value) || typeof value.token !== 'string' || value.token.length === 0) {
      return null
    }

    sandboxes[key] = {token: value.token}
  }

  return {sandboxes, version: SANDBOX_MARKER_VERSION}
}

function readMarkerFile(dir: string): MarkerFile | null {
  const filePath = sandboxMarkerPath(dir)
  if (!fs.existsSync(filePath)) return null

  try {
    return parseMarkerFile(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  } catch {
    return null
  }
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

function atomicWrite(dir: string, payload: MarkerFile): void {
  fs.mkdirSync(dir, {recursive: true})
  const dest = sandboxMarkerPath(dir)
  const tmp = join(dir, `${TEMP_PREFIX}${process.pid}`)

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
    cleanupTempFiles(dir)
  }
}

export function readMarkerToken(dir: string, host: string, tenantId: number | string): null | string {
  const file = readMarkerFile(dir)
  if (!file) return null
  return file.sandboxes[sandboxMarkerKey(host, tenantId)]?.token ?? null
}

export function writeMarkerToken(dir: string, host: string, tenantId: number | string): string {
  const token = randomUUID()
  const existing = readMarkerFile(dir)
  const sandboxes = existing?.sandboxes ? {...existing.sandboxes} : {}
  sandboxes[sandboxMarkerKey(host, tenantId)] = {token}
  atomicWrite(dir, {sandboxes, version: SANDBOX_MARKER_VERSION})
  return token
}

export function invalidateMarkerHost(dir: string, host: string): void {
  const file = readMarkerFile(dir)
  if (!file) return

  const prefix = `${host}#`
  const sandboxes: Record<string, MarkerEntry> = {}
  for (const [key, entry] of Object.entries(file.sandboxes)) {
    if (!key.startsWith(prefix)) {
      sandboxes[key] = entry
    }
  }

  atomicWrite(dir, {sandboxes, version: SANDBOX_MARKER_VERSION})
}

export function invalidateSandboxMarkerForOrigin(dir: string, instanceOrigin: string): void {
  invalidateMarkerHost(dir, instanceHost(instanceOrigin))
}
