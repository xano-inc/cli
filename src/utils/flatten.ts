import snakeCase from 'lodash.snakecase'
import * as fs from 'node:fs'
import {basename, dirname, join, relative, resolve} from 'node:path'

import {placeDocuments, splitMultidoc} from './document-parser.js'

/** Outcome of flattening one bundle file. */
export interface FlattenResult {
  /** True when the original bundle was removed. */
  removedSource: boolean
  /** Why the file was skipped, if it was (empty / single-document). */
  skipped?: 'empty' | 'single'
  /** Absolute paths written (or that would be written, in dry-run). */
  written: string[]
}

export interface FlattenOptions {
  /** Preview only — compute the plan and write nothing, delete nothing. */
  dryRun?: boolean
  /** Overwrite existing destination files instead of throwing on a clash. */
  force?: boolean
  /** Keep the original bundle file (default: delete after a successful split). */
  keepSource?: boolean
  /** Optional line logger (e.g. command.log) for a per-file plan. */
  log?: (msg: string) => void
  /** Output root (default: the bundle file's own directory). */
  outputDir?: string
}

/**
 * Split ONE multi-document `.xs` bundle (documents joined by `---`) into the
 * standard per-document tree — the exact layout `pull` produces — using the
 * shared `placeDocuments` placement so the two never drift.
 *
 * Filesystem-touching, but self-contained: it reads the bundle, resolves every
 * document's destination, checks for collisions, writes, and (unless
 * `keepSource`) removes the original. Throws on a destination collision when
 * `force` is not set, and never deletes the source when a written document
 * landed on the source's own path.
 *
 * Shared by the `flatten` command and the push-time prompt, so a user who
 * confirms "flatten now?" gets byte-identical output to running `xano flatten`.
 */
export function flattenBundleFile(bundleFile: string, opts: FlattenOptions = {}): FlattenResult {
  const {dryRun = false, force = false, keepSource = false, log} = opts
  const content = fs.readFileSync(bundleFile, 'utf8').trim()
  const documents = splitMultidoc(content)

  if (documents.length === 0) return {removedSource: false, skipped: 'empty', written: []}
  if (documents.length === 1) return {removedSource: false, skipped: 'single', written: []}

  const outputDir = opts.outputDir ? resolve(opts.outputDir) : dirname(bundleFile)

  const placed = placeDocuments(documents, {join, relative, snakeCase})

  // Pre-check destination collisions (unless --force / dry-run). A written file
  // landing on the source's own path is not a clash — it replaces the bundle.
  if (!dryRun && !force) {
    const clashes = placed
      .map((p) => join(outputDir, p.relPath))
      .filter((abs) => fs.existsSync(abs) && resolve(abs) !== resolve(bundleFile))
    if (clashes.length > 0) {
      throw new Error(
        `Destination file(s) already exist (use --force to overwrite):\n` +
          clashes.map((c) => `    ${relative(process.cwd(), c) || c}`).join('\n'),
      )
    }
  }

  const written: string[] = []
  for (const p of placed) {
    const abs = join(outputDir, p.relPath)
    if (log) log(`  WRITE  ${relative(process.cwd(), abs) || p.relPath}`)
    if (!dryRun) {
      fs.mkdirSync(dirname(abs), {recursive: true})
      fs.writeFileSync(abs, p.content.endsWith('\n') ? p.content : `${p.content}\n`, 'utf8')
    }

    written.push(abs)
  }

  // Remove the original bundle unless asked to keep it, and never when a split
  // document was written over the source's own path.
  let removedSource = false
  if (!dryRun && !keepSource) {
    const wroteOverSource = placed.some((p) => resolve(join(outputDir, p.relPath)) === resolve(bundleFile))
    if (wroteOverSource) {
      if (log) log(`  (source ${basename(bundleFile)} was overwritten by a split document; not deleting)`)
    } else {
      fs.rmSync(bundleFile)
      removedSource = true
      if (log) log(`  removed ${relative(process.cwd(), bundleFile) || bundleFile}`)
    }
  }

  return {removedSource, written}
}
