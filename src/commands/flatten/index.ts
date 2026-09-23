import {Args, Command, Flags, ux} from '@oclif/core'
import * as fs from 'node:fs'
import {join, relative, resolve} from 'node:path'

import {flattenBundleFile} from '../../utils/flatten.js'

/**
 * Split a multi-document `.xs` bundle into the standard one-document-per-file
 * layout that the push pipeline requires.
 *
 * A hand-authored bundle keeps every object (workspace, tables, queries,
 * microservices, …) in a single file joined by `---`. That is convenient to
 * edit but unsupported by `push`: the partial-diff filter and GUID writeback
 * both parse only the first document in a file, so such a bundle silently
 * pushes nothing (partial mode) or corrupts GUIDs (full mode). `flatten` turns
 * it back into the exact tree `pull` would have produced, using the shared
 * placement logic so the two never drift.
 *
 * Not a BaseCommand: this is a purely local, offline transform — no profile,
 * token, or network — so it extends oclif's Command directly.
 */
export default class Flatten extends Command {
  static override args = {
    input: Args.string({
      description: 'A multi-document .xs file, or a directory containing them, to split',
      required: true,
    }),
  }
  static override description =
    'Split a multi-document .xs bundle (documents joined by `---`) into the standard ' +
    'one-document-per-file layout that push requires. Deletes the original bundle by ' +
    'default (use --keep-source to keep it). Purely local — no network.'
  static override examples = [
    `$ xano flatten secret/pdf-micro/multidoc.xs
Split the bundle in place into per-document files (removes multidoc.xs)`,
    `$ xano flatten ./bundle.xs -o ./workspace
Write the split files under ./workspace instead of alongside the bundle`,
    `$ xano flatten secret/pdf-micro/multidoc.xs --dry-run
Preview the file layout without writing anything`,
    `$ xano flatten ./dir-of-bundles --keep-source
Flatten every multi-doc .xs under a directory, keeping the originals`,
  ]
  static override flags = {
    'dry-run': Flags.boolean({
      default: false,
      description: 'Show the resulting file layout without writing anything',
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Overwrite existing destination files instead of erroring',
    }),
    'keep-source': Flags.boolean({
      default: false,
      description: 'Keep the original multi-document file(s) (default: delete after a successful split)',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output directory (default: the directory each bundle file lives in)',
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Flatten)

    const inputPath = resolve(args.input)
    if (!fs.existsSync(inputPath)) {
      this.error(`Not found: ${inputPath}`)
    }

    // Resolve the set of bundle files to flatten.
    const bundleFiles = fs.statSync(inputPath).isDirectory()
      ? this.collectMultiDocFiles(inputPath)
      : [inputPath]

    if (bundleFiles.length === 0) {
      this.error(
        fs.statSync(inputPath).isDirectory()
          ? `No multi-document .xs files found under ${inputPath}`
          : `${inputPath} is not a .xs file`,
      )
    }

    let totalWritten = 0
    for (const bundleFile of bundleFiles) {
      totalWritten += this.flattenOne(bundleFile, flags)
    }

    if (flags['dry-run']) {
      this.log('')
      this.log(ux.colorize('dim', `Dry run — ${totalWritten} file(s) would be written. Nothing changed.`))
    } else {
      this.log('')
      this.log(`Flattened ${bundleFiles.length} bundle(s) into ${totalWritten} file(s).`)
    }
  }

  /** Recursively collect `.xs` files under a dir that actually hold >1 document. */
  private collectMultiDocFiles(dir: string): string[] {
    const out: string[] = []
    const walk = (d: string): void => {
      for (const entry of fs.readdirSync(d, {withFileTypes: true})) {
        const full = join(d, entry.name)
        if (entry.isDirectory()) {
          walk(full)
        } else if (entry.isFile() && entry.name.endsWith('.xs')) {
          const content = fs.readFileSync(full, 'utf8')
          if (/^---$/m.test(content)) out.push(full)
        }
      }
    }

    walk(dir)
    return out.sort()
  }

  /** Flatten a single bundle file. Returns the number of documents written. */
  private flattenOne(bundleFile: string, flags: {['dry-run']: boolean; force: boolean; ['keep-source']: boolean; output?: string}): number {
    const rel = relative(process.cwd(), bundleFile) || bundleFile

    let result
    try {
      // Buffer the plan so we can print a header before it only when there's work.
      const planLines: string[] = []
      result = flattenBundleFile(bundleFile, {
        dryRun: flags['dry-run'],
        force: flags.force,
        keepSource: flags['keep-source'],
        log: (msg) => planLines.push(msg),
        outputDir: flags.output,
      })

      if (result.skipped === 'empty') {
        this.warn(`No parseable documents in ${rel}; skipping.`)
        return 0
      }

      if (result.skipped === 'single') {
        this.warn(`${rel} holds a single document; nothing to split. Skipping.`)
        return 0
      }

      this.log('')
      this.log(ux.colorize('bold', `${rel} → ${result.written.length} documents`))
      for (const l of planLines) {
        // Colorize the WRITE marker; dim the incidental notes.
        this.log(l.startsWith('  WRITE') ? l.replace('WRITE', ux.colorize('green', 'WRITE')) : ux.colorize('dim', l))
      }
    } catch (error) {
      this.error((error as Error).message)
    }

    return result.written.length
  }
}
