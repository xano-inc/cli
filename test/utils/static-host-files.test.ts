import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import {dirname, isAbsolute, join} from 'node:path'

import {collectStaticHostFiles} from '../../src/utils/static-host-files.js'

describe('collectStaticHostFiles', () => {
  let root: string

  const write = (relPath: string, content = 'x'): void => {
    const abs = join(root, relPath)
    fs.mkdirSync(dirname(abs), {recursive: true})
    fs.writeFileSync(abs, content)
  }

  beforeEach(() => {
    root = fs.mkdtempSync(join(os.tmpdir(), 'static-host-files-'))
    write('index.html')
    write('app.js')
    write('src/index.js')
    write('.env', 'SECRET=1')
    write('build.log')
    write('dist/bundle.js')
    write('node_modules/pkg/x.js')
    write('.git/config')
    write('.gitignore', 'node_modules/\ndist\n*.log\n.env\n')
  })

  afterEach(() => {
    fs.rmSync(root, {force: true, recursive: true})
  })

  it('excludes files and directories matched by .gitignore', () => {
    const files = collectStaticHostFiles(root, {respectGitignore: true})
    expect(files).to.deep.equal(['.gitignore', 'app.js', 'index.html', 'src/index.js'])
  })

  it('prunes whole directories ignored via a trailing-slash rule (node_modules/)', () => {
    const files = collectStaticHostFiles(root, {respectGitignore: true})
    expect(files.some((f) => f.startsWith('node_modules/'))).to.be.false
    expect(files.some((f) => f.startsWith('dist/'))).to.be.false
  })

  it('always excludes the .git/ directory, even when respecting .gitignore', () => {
    const files = collectStaticHostFiles(root, {respectGitignore: true})
    expect(files.some((f) => f === '.git' || f.startsWith('.git/'))).to.be.false
  })

  it('includes gitignored files when respectGitignore is false, but still excludes .git/', () => {
    const files = collectStaticHostFiles(root, {respectGitignore: false})
    expect(files).to.include('.env')
    expect(files).to.include('build.log')
    expect(files).to.include('node_modules/pkg/x.js')
    expect(files.some((f) => f === '.git' || f.startsWith('.git/'))).to.be.false
  })

  it('returns every file (except .git/) when no .gitignore is present', () => {
    fs.rmSync(join(root, '.gitignore'))
    const files = collectStaticHostFiles(root, {respectGitignore: true})
    expect(files).to.include('.env')
    expect(files).to.include('node_modules/pkg/x.js')
    expect(files.some((f) => f.startsWith('.git/'))).to.be.false
  })

  it('returns POSIX-relative paths in sorted order', () => {
    const files = collectStaticHostFiles(root, {respectGitignore: true})
    expect(files).to.deep.equal([...files].sort())
    expect(files.every((f) => !f.includes('\\') && !isAbsolute(f))).to.be.true
  })
})
