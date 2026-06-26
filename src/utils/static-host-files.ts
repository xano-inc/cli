import ignore from 'ignore'
import * as fs from 'node:fs'
import {join, relative, sep} from 'node:path'

export interface CollectStaticHostFilesOptions {
  /**
   * When true, skip files matched by the source directory's `.gitignore`.
   * The `.git/` folder is always excluded regardless of this setting.
   */
  respectGitignore: boolean
}

/**
 * Collect the files to upload for a static-host build, as POSIX-relative paths
 * (sorted, for a deterministic archive).
 *
 * Honours the `.gitignore` at the root of `sourceDir` when `respectGitignore` is
 * set, and always excludes the `.git/` directory — it is repo metadata, never
 * deployable output.
 *
 * Directory rules in `.gitignore` carry a trailing slash (e.g. `node_modules/`),
 * and the `ignore` package only matches those when the tested path also ends in a
 * slash — so directories are tested as `${rel}/` (which also lets us prune the
 * whole subtree) while files are tested as-is.
 */
export function collectStaticHostFiles(
  sourceDir: string,
  options: CollectStaticHostFilesOptions,
): string[] {
  const ig = ignore().add('.git')
  if (options.respectGitignore) {
    const gitignorePath = join(sourceDir, '.gitignore')
    if (fs.existsSync(gitignorePath)) {
      ig.add(fs.readFileSync(gitignorePath, 'utf8'))
    }
  }

  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const abs = join(dir, entry.name)
      const rel = relative(sourceDir, abs).split(sep).join('/')
      if (entry.isDirectory()) {
        if (!ig.ignores(`${rel}/`)) walk(abs)
      } else if (entry.isFile() && !ig.ignores(rel)) {
        files.push(rel)
      }
    }
  }

  walk(sourceDir)
  return files.sort()
}
