import {Args, Flags} from '@oclif/core'
import {execSync} from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import snakeCase from 'lodash.snakecase'

import BaseCommand from '../../../../base-command.js'
import {type ParsedDocument, parseDocument} from '../../../../utils/document-parser.js'

interface RepoInfo {
  host: 'github' | 'gitlab' | 'other'
  owner: string
  pathInRepo: string
  ref: string
  repo: string
  url: string
}

export default class GitPull extends BaseCommand {
  static args = {
    directory: Args.string({
      description: 'Output directory for imported files',
      required: true,
    }),
  }

  static override description = 'Pull XanoScript files from a git repository into a local directory'

  static override examples = [
    `$ xano workspace git pull ./output -r https://github.com/owner/repo`,
    `$ xano workspace git pull ./output -r https://github.com/owner/repo/tree/main/path/to/dir`,
    `$ xano workspace git pull ./output -r https://github.com/owner/repo/blob/main/path/to/file.xs`,
    `$ xano workspace git pull ./output -r git@github.com:owner/repo.git`,
    `$ xano workspace git pull ./output -r https://github.com/owner/private-repo -t ghp_xxx`,
    `$ xano workspace git pull ./output -r https://gitlab.com/owner/repo/-/tree/master/path`,
    `$ xano workspace git pull ./output -r https://gitlab.com/owner/repo -b main`,
  ]

  static override flags = {
    ...BaseCommand.baseFlags,
    branch: Flags.string({
      char: 'b',
      description: 'Branch, tag, or ref to fetch (defaults to repository default branch)',
      required: false,
    }),
    path: Flags.string({
      description: 'Subdirectory within the repo to import from',
      required: false,
    }),
    repo: Flags.string({
      char: 'r',
      description: 'Git repository URL (GitHub HTTPS, SSH, or any git URL)',
      required: true,
    }),
    token: Flags.string({
      char: 't',
      description: 'Personal access token for private repos (falls back to GITHUB_TOKEN env var)',
      env: 'GITHUB_TOKEN',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(GitPull)
    const token = flags.token || ''
    const outputDir = path.resolve(args.directory)

    // Normalize the URL to extract owner/repo/ref/path from various formats
    const repoInfo = this.parseRepoUrl(flags.repo)

    // CLI flags override values extracted from the URL
    const ref = flags.branch || repoInfo.ref
    const subPath = flags.path || repoInfo.pathInRepo

    // Create a temp directory for fetching
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xano-git-pull-'))

    try {
      // Fetch repository contents
      let repoRoot: string

      if (repoInfo.host === 'github') {
        repoRoot = await this.fetchGitHubTarball(repoInfo.owner, repoInfo.repo, ref, token, tempDir, flags.verbose)
      } else {
        repoRoot = this.cloneRepo(repoInfo.url, ref, token, tempDir, flags.verbose)
      }

      // Determine source directory (optionally scoped to --path or URL path)
      const sourceDir = subPath ? path.join(repoRoot, subPath) : repoRoot

      if (!fs.existsSync(sourceDir)) {
        this.error(`Path '${subPath}' not found in repository`)
      }

      if (!fs.statSync(sourceDir).isDirectory()) {
        this.error(`Path '${subPath}' is not a directory`)
      }

      // Collect all .xs files
      const xsFiles = this.collectFiles(sourceDir)

      if (xsFiles.length === 0) {
        this.error(`No .xs files found${subPath ? ` in ${subPath}` : ''} in the repository`)
      }

      // Parse each file
      const documents: ParsedDocument[] = []
      for (const filePath of xsFiles) {
        const content = fs.readFileSync(filePath, 'utf8').trim()
        if (!content) continue

        const parsed = parseDocument(content)
        if (parsed) {
          documents.push(parsed)
        }
      }

      if (documents.length === 0) {
        this.error('No valid XanoScript documents found in the repository')
      }

      // Write documents to output directory using the same file tree logic as workspace pull
      fs.mkdirSync(outputDir, {recursive: true})

      const filenameCounters: Map<string, Map<string, number>> = new Map()
      let writtenCount = 0

      for (const doc of documents) {
        const {baseName, typeDir} = this.resolveOutputPath(outputDir, doc)

        fs.mkdirSync(typeDir, {recursive: true})

        // Track duplicates per directory
        const dirKey = path.relative(outputDir, typeDir)
        if (!filenameCounters.has(dirKey)) {
          filenameCounters.set(dirKey, new Map())
        }

        const typeCounters = filenameCounters.get(dirKey)!
        const count = typeCounters.get(baseName) || 0
        typeCounters.set(baseName, count + 1)

        const filename = count === 0 ? `${baseName}.xs` : `${baseName}_${count + 1}.xs`
        const filePath = path.join(typeDir, filename)
        fs.writeFileSync(filePath, doc.content, 'utf8')
        writtenCount++
      }

      const source = subPath ? `${flags.repo} (${subPath})` : flags.repo
      this.log(`Pulled ${writtenCount} documents from ${source} to ${args.directory}`)
    } finally {
      // Clean up temp directory
      fs.rmSync(tempDir, {force: true, recursive: true})
    }
  }

  /**
   * Recursively collect all .xs files from a directory, sorted for deterministic ordering.
   */
  private collectFiles(dir: string): string[] {
    const files: string[] = []
    const entries = fs.readdirSync(dir, {withFileTypes: true})

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...this.collectFiles(fullPath))
      } else if (entry.isFile() && entry.name.endsWith('.xs')) {
        files.push(fullPath)
      }
    }

    return files.sort()
  }

  /**
   * Clone a git repository using shallow clone.
   */
  private cloneRepo(cloneUrl: string, ref: string, token: string, tempDir: string, verbose: boolean): string {
    let url = cloneUrl

    // Inject token into HTTPS URLs for private repos
    if (token && url.startsWith('https://')) {
      const parsed = new URL(url)
      parsed.username = token
      url = parsed.toString()
    }

    const args = ['git', 'clone', '--depth', '1']
    if (ref) {
      args.push('--branch', ref)
    }

    const cloneTarget = path.join(tempDir, 'repo')
    args.push(url, cloneTarget)

    if (verbose) {
      this.log(`Cloning ${cloneUrl}...`)
    }

    try {
      execSync(args.join(' '), {stdio: verbose ? 'inherit' : 'pipe'})
    } catch (error) {
      this.error(`Failed to clone repository: ${(error as Error).message}`)
    }

    return cloneTarget
  }

  /**
   * Fetch a GitHub repository via the tarball API for fast download without requiring git.
   */
  private async fetchGitHubTarball(
    owner: string,
    repo: string,
    ref: string,
    token: string,
    tempDir: string,
    verbose: boolean,
  ): Promise<string> {
    const tarballRef = ref || 'HEAD'
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${tarballRef}`

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'xano-cli',
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    if (verbose) {
      this.log(`Fetching tarball from GitHub: ${owner}/${repo}${ref ? `@${ref}` : ''}...`)
    }

    const response = await fetch(apiUrl, {headers, redirect: 'follow'})

    if (!response.ok) {
      const errorText = await response.text()
      if (response.status === 404) {
        this.error(
          `Repository '${owner}/${repo}' not found (or is private). ` +
            `Use --token to authenticate for private repos.`,
        )
      }

      this.error(`GitHub API request failed (${response.status}): ${errorText}`)
    }

    // Save the tarball to a temp file
    const tarballPath = path.join(tempDir, 'repo.tar.gz')
    const buffer = Buffer.from(await response.arrayBuffer())
    fs.writeFileSync(tarballPath, buffer)

    // Extract the tarball
    const extractDir = path.join(tempDir, 'extracted')
    fs.mkdirSync(extractDir, {recursive: true})

    try {
      execSync(`tar xzf "${tarballPath}" -C "${extractDir}"`, {stdio: verbose ? 'inherit' : 'pipe'})
    } catch (error) {
      this.error(`Failed to extract tarball: ${(error as Error).message}`)
    }

    // GitHub tarballs have a root directory like "owner-repo-sha/"
    const extractedEntries = fs.readdirSync(extractDir)
    if (extractedEntries.length === 1) {
      const rootDir = path.join(extractDir, extractedEntries[0])
      if (fs.statSync(rootDir).isDirectory()) {
        return rootDir
      }
    }

    return extractDir
  }

  /**
   * Parse a repository URL to extract host, owner, repo, ref, and path.
   * Supports various URL formats:
   *
   * GitHub:
   *   https://github.com/owner/repo
   *   https://github.com/owner/repo.git
   *   git@github.com:owner/repo.git
   *   https://github.com/owner/repo/tree/main/path/to/dir
   *   https://github.com/owner/repo/blob/main/path/to/file.xs
   *   https://raw.githubusercontent.com/owner/repo/refs/heads/main/path/to/file.xs
   *
   * GitLab:
   *   https://gitlab.com/owner/repo
   *   https://gitlab.com/owner/repo/-/tree/master/path/to/dir
   *   https://gitlab.com/owner/repo/-/blob/master/path/to/file
   *
   * Other git URLs passed through for git clone.
   */
  private parseRepoUrl(inputUrl: string): RepoInfo {
    // GitHub SSH: git@github.com:owner/repo.git
    const sshMatch = inputUrl.match(/^git@github\.com:([^/]+)\/([^/.]+?)(?:\.git)?$/)
    if (sshMatch) {
      return {host: 'github', owner: sshMatch[1], pathInRepo: '', ref: '', repo: sshMatch[2], url: inputUrl}
    }

    // raw.githubusercontent.com: https://raw.githubusercontent.com/owner/repo/refs/heads/branch/path
    const rawGhMatch = inputUrl.match(
      /^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/refs\/heads\/([^/]+)\/?(.*)/,
    )
    if (rawGhMatch) {
      const filePath = rawGhMatch[4] || ''
      // Strip the filename to get the directory path, since this points to a single file
      const dirPath = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : ''
      return {
        host: 'github',
        owner: rawGhMatch[1],
        pathInRepo: dirPath,
        ref: rawGhMatch[3],
        repo: rawGhMatch[2],
        url: inputUrl,
      }
    }

    let parsed: URL
    try {
      parsed = new URL(inputUrl)
    } catch {
      // Not a URL — treat as a generic git clone target
      return {host: 'other', owner: '', pathInRepo: '', ref: '', repo: '', url: inputUrl}
    }

    const host = parsed.hostname.toLowerCase()
    const pathParts = parsed.pathname
      .replace(/^\//, '')
      .replace(/\.git$/, '')
      .split('/')

    // GitHub HTTPS
    if (host === 'github.com' && pathParts.length >= 2) {
      const owner = pathParts[0]
      const repo = pathParts[1]

      // https://github.com/owner/repo/tree/branch/path/to/dir
      // https://github.com/owner/repo/blob/branch/path/to/file.xs
      if (pathParts.length >= 4 && (pathParts[2] === 'tree' || pathParts[2] === 'blob')) {
        const ref = pathParts[3]
        const subPath = pathParts.slice(4).join('/')
        let dirPath = subPath
        // For blob links, strip the filename to get directory
        if (pathParts[2] === 'blob' && subPath.includes('/')) {
          dirPath = subPath.slice(0, subPath.lastIndexOf('/'))
        } else if (pathParts[2] === 'blob') {
          dirPath = '' // File is at repo root
        }

        return {host: 'github', owner, pathInRepo: dirPath, ref, repo, url: inputUrl}
      }

      // https://github.com/owner/repo (root)
      return {host: 'github', owner, pathInRepo: '', ref: '', repo, url: inputUrl}
    }

    // GitLab HTTPS
    if (host === 'gitlab.com' && pathParts.length >= 2) {
      const owner = pathParts[0]
      const repo = pathParts[1]
      // Reconstruct clean clone URL
      const cloneUrl = `https://gitlab.com/${owner}/${repo}.git`

      // https://gitlab.com/owner/repo/-/tree/branch/path/to/dir
      // https://gitlab.com/owner/repo/-/blob/branch/path/to/file
      const dashIdx = pathParts.indexOf('-')
      if (dashIdx >= 2 && pathParts.length >= dashIdx + 3) {
        const action = pathParts[dashIdx + 1] // tree, blob, or raw
        if (action === 'tree' || action === 'blob' || action === 'raw') {
          const ref = pathParts[dashIdx + 2]
          const subPath = pathParts.slice(dashIdx + 3).join('/')
          let dirPath = subPath
          if ((action === 'blob' || action === 'raw') && subPath.includes('/')) {
            dirPath = subPath.slice(0, subPath.lastIndexOf('/'))
          } else if (action === 'blob' || action === 'raw') {
            dirPath = ''
          }

          return {host: 'gitlab', owner, pathInRepo: dirPath, ref, repo, url: cloneUrl}
        }
      }

      // https://gitlab.com/owner/repo (root)
      return {host: 'gitlab', owner, pathInRepo: '', ref: '', repo, url: cloneUrl}
    }

    // Other git URLs — pass through for git clone
    return {host: 'other', owner: '', pathInRepo: '', ref: '', repo: '', url: inputUrl}
  }

  /**
   * Resolve the output directory and base filename for a parsed document.
   * Uses the same type-to-directory mapping as workspace pull.
   */
  private resolveOutputPath(outputDir: string, doc: ParsedDocument): {baseName: string; typeDir: string} {
    let typeDir: string
    let baseName: string

    if (doc.type === 'workspace') {
      typeDir = path.join(outputDir, 'workspace')
      baseName = this.sanitizeFilename(doc.name)
    } else if (doc.type === 'workspace_trigger') {
      typeDir = path.join(outputDir, 'workspace', 'trigger')
      baseName = this.sanitizeFilename(doc.name)
    } else if (doc.type === 'agent') {
      typeDir = path.join(outputDir, 'ai', 'agent')
      baseName = this.sanitizeFilename(doc.name)
    } else if (doc.type === 'mcp_server') {
      typeDir = path.join(outputDir, 'ai', 'mcp_server')
      baseName = this.sanitizeFilename(doc.name)
    } else if (doc.type === 'tool') {
      typeDir = path.join(outputDir, 'ai', 'tool')
      baseName = this.sanitizeFilename(doc.name)
    } else if (doc.type === 'agent_trigger') {
      typeDir = path.join(outputDir, 'ai', 'agent', 'trigger')
      baseName = this.sanitizeFilename(doc.name)
    } else if (doc.type === 'mcp_server_trigger') {
      typeDir = path.join(outputDir, 'ai', 'mcp_server', 'trigger')
      baseName = this.sanitizeFilename(doc.name)
    } else if (doc.type === 'table_trigger') {
      typeDir = path.join(outputDir, 'table', 'trigger')
      baseName = this.sanitizeFilename(doc.name)
    } else if (doc.type === 'realtime_channel') {
      typeDir = path.join(outputDir, 'realtime', 'channel')
      baseName = this.sanitizeFilename(doc.name)
    } else if (doc.type === 'realtime_trigger') {
      typeDir = path.join(outputDir, 'realtime', 'trigger')
      baseName = this.sanitizeFilename(doc.name)
    } else if (doc.type === 'api_group') {
      const groupFolder = snakeCase(doc.name)
      typeDir = path.join(outputDir, 'api', groupFolder)
      baseName = 'api_group'
    } else if (doc.type === 'query' && doc.apiGroup) {
      const groupFolder = snakeCase(doc.apiGroup)
      const nameParts = doc.name.split('/')
      const leafName = nameParts.pop()!
      const folderParts = nameParts.map((part) => snakeCase(part))
      typeDir = path.join(outputDir, 'api', groupFolder, ...folderParts)
      baseName = this.sanitizeFilename(leafName)
      if (doc.verb) {
        baseName = `${baseName}_${doc.verb}`
      }
    } else {
      const nameParts = doc.name.split('/')
      const leafName = nameParts.pop()!
      const folderParts = nameParts.map((part) => snakeCase(part))
      typeDir = path.join(outputDir, doc.type, ...folderParts)
      baseName = this.sanitizeFilename(leafName)
      if (doc.verb) {
        baseName = `${baseName}_${doc.verb}`
      }
    }

    return {baseName, typeDir}
  }

  /**
   * Sanitize a document name for use as a filename.
   */
  private sanitizeFilename(name: string): string {
    return snakeCase(name.replaceAll('"', ''))
  }
}
