/* eslint-disable camelcase -- knowledge_type / dry_run / guid_map are external Metadata API field names */
import * as yaml from 'js-yaml'
import snakeCase from 'lodash.snakecase'
import {minimatch} from 'minimatch'
import * as fs from 'node:fs'
import {dirname, join, relative, sep} from 'node:path'

// ── Types ────────────────────────────────────────────────────────────────────
//
// Knowledge mirrors the multidoc model: the server returns self-describing
// *objects* and the CLI owns the on-disk folder layout + YAML frontmatter
// (see workspace/pull for the equivalent `.xs` mapping). We deliberately do NOT
// let the server dictate file paths.

export const KNOWLEDGE_DIR = 'knowledge'

export type KnowledgeType = 'agents.md' | 'doc' | 'skill'

/** A reference file attached to a skill (knowledge_file). */
export interface KnowledgeFile {
  content: string
  /** Path relative to the skill's `references/` folder, POSIX-separated. */
  name: string
}

/** A workspace-scoped knowledge object as exchanged with the API. */
export interface KnowledgeObject {
  content: string // markdown body, WITHOUT frontmatter
  description?: string
  enabled?: boolean
  files?: KnowledgeFile[] // references; skills only
  guid?: string
  knowledge_type: KnowledgeType
  mode?: string
  name: string
  scope?: string
  tag?: string[]
}

/** A locally-collected object that also remembers its primary file on disk (for GUID writeback). */
export interface LocalKnowledgeObject extends KnowledgeObject {
  filePath: string
}

export interface KnowledgePushBody {
  branch?: string
  delete?: boolean
  dry_run?: boolean
  force?: boolean
  items: KnowledgeObject[]
}

export interface KnowledgePushResult {
  deleted?: number
  guid_map?: Array<{guid: string; name: string}>
  imported?: number
  // Present only when the server honors `dry_run`
  operations?: KnowledgeDryRunOperation[]
  summary?: Record<string, KnowledgeDryRunSummary>
}

export interface KnowledgeDryRunOperation {
  action: string
  name: string
  type: string
}

export interface KnowledgeDryRunSummary {
  created: number
  deleted: number
  unchanged: number
  updated: number
}

export interface KnowledgeDryRunResult {
  operations: KnowledgeDryRunOperation[]
  summary: Record<string, KnowledgeDryRunSummary>
}

// eslint-disable-next-line n/no-unsupported-features/node-builtins, no-undef
type VerboseFetch = (url: string, options: RequestInit, verbose: boolean, authToken?: string) => Promise<Response>

// ── Frontmatter ──────────────────────────────────────────────────────────────

const FRONTMATTER_ORDER = [
  'name',
  'description',
  'knowledge_type',
  'scope',
  'inclusion',
  'tags',
  'enabled',
  'guid',
] as const

/**
 * Build a primary `.md` file body: YAML frontmatter (built from the object's
 * structured fields) followed by the markdown content.
 */
export function buildPrimaryContent(obj: KnowledgeObject): string {
  const meta: Record<string, unknown> = {}
  meta.name = obj.name
  if (obj.description !== undefined) meta.description = obj.description
  meta.knowledge_type = obj.knowledge_type
  if (obj.scope !== undefined) meta.scope = obj.scope
  if (obj.mode !== undefined) meta.inclusion = modeToInclusion(obj.mode)
  if (obj.tag !== undefined && obj.tag.length > 0) meta.tags = obj.tag
  if (obj.enabled !== undefined) meta.enabled = obj.enabled
  if (obj.guid !== undefined) meta.guid = obj.guid

  // Emit keys in a stable, human-friendly order.
  const ordered: Record<string, unknown> = {}
  for (const key of FRONTMATTER_ORDER) {
    if (key in meta) ordered[key] = meta[key]
  }

  const fm = yaml.dump(ordered, {lineWidth: -1}).trimEnd()
  const body = obj.content ?? ''
  return `---\n${fm}\n---\n${body}`
}

/**
 * Split a primary `.md` file into its frontmatter fields and markdown body.
 * Returns `{meta: {}, body: <raw>}` when there is no leading `---` block.
 */
export function parsePrimaryContent(raw: string): {body: string; meta: Record<string, unknown>} {
  const lines = raw.split('\n')
  if (lines[0]?.trim() !== '---') return {body: raw, meta: {}}

  let close = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      close = i
      break
    }
  }

  if (close === -1) return {body: raw, meta: {}}

  const fmText = lines.slice(1, close).join('\n')
  const body = lines.slice(close + 1).join('\n')
  let meta: Record<string, unknown> = {}
  try {
    meta = (yaml.load(fmText) as Record<string, unknown>) ?? {}
  } catch {
    meta = {}
  }

  return {body, meta}
}

/** Read just `guid`/`name` from frontmatter (used by GUID matching). */
export function parseFrontmatter(content: string): {guid?: string; name?: string} {
  const {meta} = parsePrimaryContent(content)
  const result: {guid?: string; name?: string} = {}
  if (typeof meta.guid === 'string') result.guid = meta.guid
  if (typeof meta.name === 'string') result.name = meta.name
  return result
}

// ── Mode normalization ───────────────────────────────────────────────────────

/**
 * The API only accepts the backend `mode` enum (`auto` | `referenced` | `always`),
 * but on disk (and in the Xano UI) this is the `inclusion` field with values
 * "on demand" / "manual" / "always" — see `modeToInclusion` for the pull-side
 * mapping. Hand-authored frontmatter (or content copied from the UI) commonly
 * uses the display label instead, which the API rejects with e.g. `Input
 * "on demand" is not one of the allowable values.` (DEV-7380/DEV-7382).
 * Normalize known aliases before every push so the backend enum value is
 * always what's sent.
 */
const MODE_ALIASES: Record<string, string> = {
  'always included': 'always',
  'manual': 'referenced',
  'on demand': 'auto',
}

function normalizeMode(mode: string): string {
  return MODE_ALIASES[mode.trim().toLowerCase()] ?? mode
}

/** Map the backend `mode` enum to the `inclusion:` frontmatter value shown in the Xano UI. */
const MODE_TO_INCLUSION: Record<string, string> = {
  always: 'always',
  auto: 'on demand',
  referenced: 'manual',
}

function modeToInclusion(mode: string): string {
  return MODE_TO_INCLUSION[mode] ?? mode
}

/** Parse the on-disk `tags:` frontmatter value into a string array, or `undefined` if absent/malformed. */
function parseTags(tags: unknown): string[] | undefined {
  return Array.isArray(tags) && tags.every((t) => typeof t === 'string') ? tags : undefined
}

// ── Path mapping (CLI-owned layout) ────────────────────────────────────────────

/**
 * Allocate a unique snake_case folder/file segment per call, suffixing
 * collisions with `_2`, `_3`, … . Each object instance gets its own segment —
 * we deliberately do NOT memoize by name, because two distinct objects can
 * share a name (identity travels via the frontmatter `guid`, not the path), and
 * collapsing them onto one path would silently overwrite files.
 */
function makeNameResolver(): (name: string) => string {
  const taken = new Set<string>()
  return (name: string) => {
    const base = snakeCase(name) || 'untitled'
    let candidate = base
    let n = 2
    while (taken.has(candidate)) {
      candidate = `${base}_${n}`
      n++
    }

    taken.add(candidate)
    return candidate
  }
}

interface PathResolvers {
  doc: (name: string) => string
  skill: (name: string) => string
}

/** POSIX path (relative to `knowledge/`) of an object's primary `.md` file. */
function primaryRelPath(obj: KnowledgeObject, resolvers: PathResolvers): string {
  switch (obj.knowledge_type) {
    case 'agents.md': {
      return 'agents.md'
    }

    case 'doc': {
      return `docs/${resolvers.doc(obj.name)}.md`
    }

    case 'skill': {
      return `skills/${resolvers.skill(obj.name)}/SKILL.md`
    }
  }
}

/** Infer the knowledge type from a primary file's POSIX path. */
function inferType(posixPath: string): KnowledgeType {
  if (posixPath.startsWith('skills/')) return 'skill'
  if (posixPath.startsWith('docs/')) return 'doc'
  return 'agents.md'
}

// ── Pull: write objects to disk ────────────────────────────────────────────────

/**
 * Write knowledge objects under `<outputDir>/knowledge/`, building frontmatter
 * and laying out skill reference files under `<skill>/references/`.
 * Returns the number of files written (primaries + references).
 */
export function writeKnowledge(objects: KnowledgeObject[], outputDir: string): number {
  const resolvers: PathResolvers = {doc: makeNameResolver(), skill: makeNameResolver()}
  let count = 0

  for (const obj of objects) {
    const rel = primaryRelPath(obj, resolvers)
    const primaryAbs = join(outputDir, KNOWLEDGE_DIR, ...rel.split('/'))
    fs.mkdirSync(dirname(primaryAbs), {recursive: true})
    fs.writeFileSync(primaryAbs, buildPrimaryContent(obj), 'utf8')
    count++

    if (obj.knowledge_type === 'skill' && obj.files?.length) {
      const refsDir = join(dirname(primaryAbs), 'references')
      for (const file of obj.files) {
        const refAbs = join(refsDir, ...file.name.split('/'))
        fs.mkdirSync(dirname(refAbs), {recursive: true})
        fs.writeFileSync(refAbs, file.content, 'utf8')
        count++
      }
    }
  }

  return count
}

// ── Push: collect objects from disk ────────────────────────────────────────────

function listFilesRecursive(baseDir: string, currentDir: string, out: string[]): void {
  for (const item of fs.readdirSync(currentDir, {withFileTypes: true})) {
    const fullPath = join(currentDir, item.name)
    if (item.isDirectory()) {
      listFilesRecursive(baseDir, fullPath, out)
    } else if (item.isFile()) {
      out.push(relative(baseDir, fullPath).split(sep).join('/'))
    }
  }
}

/** True if `posixPath` is a primary file (not a reference). */
function isPrimary(posixPath: string): boolean {
  if (posixPath === 'agents.md') return true
  if (/^skills\/[^/]+\/SKILL\.md$/.test(posixPath)) return true
  if (/^docs\/[^/]+\.md$/.test(posixPath)) return true
  return false
}

/**
 * Walk `<inputDir>/knowledge/`, reconstructing structured knowledge objects from
 * primary `.md` files (frontmatter → fields, body → content) and attaching each
 * skill's `references/` files. Include/exclude globs are matched against
 * `knowledge/<path>` (relative to inputDir), consistent with multidoc filtering.
 * Returns `[]` when the directory is absent.
 */
export function collectKnowledgeObjects(
  inputDir: string,
  include?: string[],
  exclude?: string[],
): LocalKnowledgeObject[] {
  const knowledgeDir = join(inputDir, KNOWLEDGE_DIR)
  if (!fs.existsSync(knowledgeDir)) return []

  const allPaths: string[] = []
  listFilesRecursive(knowledgeDir, knowledgeDir, allPaths)

  const allowed = (posixPath: string): boolean => {
    const rel = `${KNOWLEDGE_DIR}/${posixPath}`
    if (include?.length && !include.some((p) => minimatch(rel, p, {matchBase: true}))) return false
    if (exclude?.length && exclude.some((p) => minimatch(rel, p, {matchBase: true}))) return false
    return true
  }

  const objects: LocalKnowledgeObject[] = []

  for (const posixPath of allPaths.sort()) {
    if (!isPrimary(posixPath) || !allowed(posixPath)) continue

    const absPath = join(knowledgeDir, ...posixPath.split('/'))
    const raw = fs.readFileSync(absPath, 'utf8')
    const {body, meta} = parsePrimaryContent(raw)
    const knowledgeType =
      meta.knowledge_type === 'agents.md' || meta.knowledge_type === 'doc' || meta.knowledge_type === 'skill'
        ? (meta.knowledge_type as KnowledgeType)
        : inferType(posixPath)

    // The API requires description/scope/mode/enabled on every item, so default
    // them when a hand-authored file omits them (pulled files always carry them).
    // `mode` is read from the on-disk `inclusion:` field (see modeToInclusion).
    const obj: LocalKnowledgeObject = {
      content: body,
      description: typeof meta.description === 'string' ? meta.description : '',
      enabled: typeof meta.enabled === 'boolean' ? meta.enabled : true,
      filePath: absPath,
      knowledge_type: knowledgeType,
      mode: typeof meta.inclusion === 'string' ? normalizeMode(meta.inclusion) : 'auto',
      name: typeof meta.name === 'string' ? meta.name : deriveName(posixPath),
      scope: typeof meta.scope === 'string' ? meta.scope : 'workspace',
    }
    if (typeof meta.guid === 'string') obj.guid = meta.guid
    const tags = parseTags(meta.tags)
    if (tags) obj.tag = tags

    if (knowledgeType === 'skill') {
      const skillFolder = posixPath.slice('skills/'.length, posixPath.indexOf('/SKILL.md'))
      const refPrefix = `skills/${skillFolder}/references/`
      const files: KnowledgeFile[] = []
      for (const candidate of allPaths) {
        if (candidate.startsWith(refPrefix) && allowed(candidate)) {
          files.push({
            content: fs.readFileSync(join(knowledgeDir, ...candidate.split('/')), 'utf8'),
            name: candidate.slice(refPrefix.length),
          })
        }
      }

      if (files.length > 0) obj.files = files
    }

    objects.push(obj)
  }

  return objects
}

function deriveName(posixPath: string): string {
  if (posixPath === 'agents.md') return 'agents.md'
  const parts = posixPath.split('/')
  if (posixPath.startsWith('skills/')) return parts[1]
  return parts.at(-1)!.replace(/\.md$/, '')
}

/** Strip the local-only `filePath` before sending objects to the API. */
export function toPushItems(objects: LocalKnowledgeObject[]): KnowledgeObject[] {
  return objects.map(({filePath: _filePath, ...rest}) => rest)
}

// ── API calls ──────────────────────────────────────────────────────────────────

/**
 * GET workspace knowledge objects (with content). Returns `[]` on 404 (instance
 * without the feature) or any network error, so pull degrades gracefully.
 */
export async function fetchKnowledge(
  baseUrl: string,
  branch: string,
  accessToken: string,
  verboseFetch: VerboseFetch,
  verbose: boolean,
): Promise<KnowledgeObject[]> {
  const params = new URLSearchParams({branch})
  const url = `${baseUrl}?${params.toString()}`
  try {
    const response = await verboseFetch(
      url,
      {headers: {accept: 'application/json', Authorization: `Bearer ${accessToken}`}, method: 'GET'},
      verbose,
      accessToken,
    )
    if (!response.ok) return []
    const json = (await response.json()) as KnowledgeObject[] | {items?: KnowledgeObject[]}
    if (Array.isArray(json)) return json
    return json.items ?? []
  } catch {
    return []
  }
}

/**
 * POST knowledge objects to the workspace. Throws on non-2xx. When `body.dry_run`
 * is set the result may carry `operations`/`summary` instead of `imported`.
 */
export async function pushKnowledge(
  url: string,
  accessToken: string,
  verboseFetch: VerboseFetch,
  verbose: boolean,
  body: KnowledgePushBody,
): Promise<KnowledgePushResult> {
  const response = await verboseFetch(
    url,
    {
      body: JSON.stringify(body),
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
    verbose,
    accessToken,
  )

  if (!response.ok) {
    const errorText = await response.text()
    let msg = `Knowledge push failed (${response.status})`
    try {
      const json = JSON.parse(errorText) as {message?: string}
      if (json.message) msg += `: ${json.message}`
    } catch {
      msg += `\n${errorText}`
    }

    throw new Error(msg)
  }

  try {
    return (await response.json()) as KnowledgePushResult
  } catch {
    return {}
  }
}

// ── Preview (client-side diff fallback) ─────────────────────────────────────────

/** Canonical form for change detection: content + description + metadata + references. */
function canonical(obj: KnowledgeObject): string {
  const files = (obj.files ?? [])
    .map((f) => ({content: f.content, name: f.name}))
    .sort((a, b) => a.name.localeCompare(b.name))
  return JSON.stringify({
    content: obj.content,
    description: obj.description ?? '',
    enabled: obj.enabled ?? null,
    files,
    mode: obj.mode ?? '',
    scope: obj.scope ?? '',
    tag: [...(obj.tag ?? [])].sort(),
  })
}

/**
 * Compute a dry-run-style preview by diffing local objects against server
 * objects (match by `guid`, then `name`). Used when the server doesn't honor
 * the `dry_run` flag.
 */
export function knowledgePreview(
  local: KnowledgeObject[],
  server: KnowledgeObject[],
  willDelete: boolean,
): KnowledgeDryRunResult {
  const operations: KnowledgeDryRunOperation[] = []
  const summary: Record<string, KnowledgeDryRunSummary> = {}
  const ensure = (type: string) => {
    summary[type] ??= {created: 0, deleted: 0, unchanged: 0, updated: 0}
  }

  const serverByGuid = new Map<string, KnowledgeObject>()
  const serverByName = new Map<string, KnowledgeObject>()
  for (const s of server) {
    if (s.guid) serverByGuid.set(s.guid, s)
    serverByName.set(s.name, s)
  }

  const matched = new Set<KnowledgeObject>()

  for (const obj of local) {
    const type = obj.knowledge_type
    ensure(type)
    const match = (obj.guid ? serverByGuid.get(obj.guid) : undefined) ?? serverByName.get(obj.name)

    if (match) {
      matched.add(match)
      if (canonical(match) === canonical(obj)) {
        summary[type].unchanged++
      } else {
        operations.push({action: 'update', name: obj.name, type})
        summary[type].updated++
      }
    } else {
      operations.push({action: 'create', name: obj.name, type})
      summary[type].created++
    }
  }

  if (willDelete) {
    for (const s of server) {
      if (!matched.has(s)) {
        const type = s.knowledge_type
        ensure(type)
        operations.push({action: 'delete', name: s.name, type})
        summary[type].deleted++
      }
    }
  }

  return {operations, summary}
}

// ── GUID writeback ──────────────────────────────────────────────────────────────

/**
 * Set or update `guid:` in a primary `.md` file's YAML frontmatter.
 * Returns true if the file was modified.
 */
export function syncGuidToFrontmatter(filePath: string, guid: string): boolean {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  if (lines[0]?.trim() !== '---') return false

  let close = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      close = i
      break
    }
  }

  if (close === -1) return false

  for (let i = 1; i < close; i++) {
    const match = lines[i].match(/^guid\s*:\s*(.+)$/)
    if (match) {
      const existing = match[1].trim().replaceAll(/^["']|["']$/g, '')
      if (existing === guid) return false
      lines[i] = `guid: ${guid}`
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
      return true
    }
  }

  lines.splice(close, 0, `guid: ${guid}`)
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
  return true
}
