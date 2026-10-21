import type {Command} from '@oclif/core'

import {expect} from 'chai'
import * as fs from 'node:fs'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {stripVTControlCharacters} from 'node:util'

import {buildDocumentKey, parseDocument} from '../../src/utils/document-parser.js'
import {
  applyFilters,
  deletesHittingFilteredOut,
  describeFilteredOut,
  executePush,
  filterChangedEntries,
  findMultiDocEntries,
  findWorkspaceEntries,
  normalizeFilterPattern,
  parseExportDocuments,
  protectGuidsFor,
  type PushFlags,
  type PushTarget,
  selectWritebacks,
  writeBackFormattedDocuments,
  unprotectableFilteredOut,
  type WritebackHttpResponse,
} from '../../src/utils/multidoc-push.js'
import {readMarkerToken, sandboxMarkerExists, writeMarkerToken} from '../../src/utils/sandbox-marker.js'
import {hashBytes, hashFile, sandboxTargetIdentity, saveSyncState, type SyncTargetIdentity} from '../../src/utils/sync-state.js'

function keyFor(content: string): string {
  const parsed = parseDocument(content)
  if (!parsed) throw new Error('failed to parse test document')
  return buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup)
}

describe('multidoc-push helpers', () => {
  describe('findMultiDocEntries', () => {
    it('flags a file holding multiple `---`-separated documents', () => {
      const entries = [
        {
          content: 'workspace w {\n}\n---\ntable documents {\n}\n---\nquery extract verb=POST {\n}\n',
          filePath: 'secret/bundle.xs',
        },
        {content: 'function ok {\n}\n', filePath: 'function/ok.xs'},
      ]
      const offenders = findMultiDocEntries(entries)
      expect(offenders).to.have.lengthOf(1)
      expect(offenders[0].filePath).to.equal('secret/bundle.xs')
      // 2 separators → 3 documents.
      expect(offenders[0].count).to.equal(3)
    })

    it('does not flag single-document files', () => {
      const entries = [
        {content: 'query documents verb=GET {\n  api_group = "pdf"\n}\n', filePath: 'api/pdf/documents_GET.xs'},
        {content: 'table documents {\n}\n', filePath: 'table/documents.xs'},
      ]
      expect(findMultiDocEntries(entries)).to.have.lengthOf(0)
    })

    it('only treats a bare `---` line as a separator (not `---` inside content)', () => {
      // A triple-dash embedded mid-line must not be mistaken for a doc boundary.
      const entries = [{content: 'query q verb=GET {\n  note = "a --- b"\n}\n', filePath: 'q.xs'}]
      expect(findMultiDocEntries(entries)).to.have.lengthOf(0)
    })
  })

  describe('findWorkspaceEntries', () => {
    it('returns every workspace document, so a push carrying two can be refused', () => {
      const entries = [
        {content: 'workspace "Crypto Chainup Cashier V2" {\n}\n', filePath: 'workspace/crypto_chainup_cashier_v2.xs'},
        {content: 'table users {\n}\n', filePath: 'table/users.xs'},
        {content: 'workspace "Crypto Tron V2" {\n}\n', filePath: 'workspace/crypto_tron_v2.xs'},
      ]

      const found = findWorkspaceEntries(entries)

      expect(found).to.have.lengthOf(2)
      expect(found.map((f) => f.name)).to.deep.equal(['Crypto Chainup Cashier V2', 'Crypto Tron V2'])
      expect(found.map((f) => f.filePath)).to.deep.equal([
        'workspace/crypto_chainup_cashier_v2.xs',
        'workspace/crypto_tron_v2.xs',
      ])
    })

    it('returns a single entry for the normal one-workspace tree', () => {
      const entries = [
        {content: 'workspace "Only One" {\n}\n', filePath: 'workspace/only_one.xs'},
        {content: 'table users {\n}\n', filePath: 'table/users.xs'},
      ]
      expect(findWorkspaceEntries(entries)).to.have.lengthOf(1)
    })

    it('does not count workspace triggers as workspace documents', () => {
      const entries = [
        {content: 'workspace "Only One" {\n}\n', filePath: 'workspace/only_one.xs'},
        {content: 'workspace_trigger on_save {\n}\n', filePath: 'workspace/trigger/on_save.xs'},
      ]
      const found = findWorkspaceEntries(entries)
      expect(found).to.have.lengthOf(1)
      expect(found[0].filePath).to.equal('workspace/only_one.xs')
    })

    it('returns nothing when the tree carries no workspace document', () => {
      const entries = [{content: 'table users {\n}\n', filePath: 'table/users.xs'}]
      expect(findWorkspaceEntries(entries)).to.have.lengthOf(0)
    })
  })

  describe('filterChangedEntries', () => {
    // The dry-run preview buckets every trigger subtype under the generic `trigger`
    // type, while local documents carry the specific subtype (DEV-7084).
    it('keeps a trigger when the preview reports the generic `trigger` type', () => {
      const entries = [
        {content: 'error_trigger "Error Trigger" {\n}\n', filePath: 'workspace/trigger/error_trigger.xs'},
        {content: 'function unchanged_fn {\n}\n', filePath: 'function/unchanged_fn.xs'},
      ]
      const operations = [
        {action: 'create', name: 'Error Trigger', type: 'trigger'},
        {action: 'unchanged', name: 'unchanged_fn', type: 'function'},
      ]

      const result = filterChangedEntries(entries, operations, false)
      expect(result).to.have.lengthOf(1)
      expect(result[0].filePath).to.equal('workspace/trigger/error_trigger.xs')
    })

    it('matches every trigger subtype against the generic `trigger` bucket', () => {
      const subtypes = [
        'workspace_trigger',
        'error_trigger',
        'table_trigger',
        'agent_trigger',
        'mcp_server_trigger',
        'realtime_trigger',
      ]
      const entries = subtypes.map((type) => ({
        content: `${type} "${type} doc" {\n}\n`,
        filePath: `${type}.xs`,
      }))
      const operations = subtypes.map((type) => ({action: 'create', name: `${type} doc`, type: 'trigger'}))

      const result = filterChangedEntries(entries, operations, false)
      expect(result).to.have.lengthOf(subtypes.length)
    })

    it('drops unchanged documents', () => {
      const entries = [
        {content: 'function changed_fn {\n}\n', filePath: 'function/changed_fn.xs'},
        {content: 'function unchanged_fn {\n}\n', filePath: 'function/unchanged_fn.xs'},
      ]
      const operations = [
        {action: 'update', name: 'changed_fn', type: 'function'},
        {action: 'unchanged', name: 'unchanged_fn', type: 'function'},
      ]

      const result = filterChangedEntries(entries, operations, false)
      expect(result).to.have.lengthOf(1)
      expect(result[0].filePath).to.equal('function/changed_fn.xs')
    })

    it('matches API endpoints by name and verb', () => {
      const entries = [{content: 'query "users/{id}" verb=GET {\n}\n', filePath: 'api/users.xs'}]
      const operations = [{action: 'create', name: 'users/{id} GET', type: 'query'}]

      const result = filterChangedEntries(entries, operations, false)
      expect(result).to.have.lengthOf(1)
    })
  })

  describe('normalizeFilterPattern', () => {
    // minimatch has no directory syntax, so the two spellings a person reaches
    // for first ("table/" and bare "table") silently match NOTHING. Combined
    // with --delete, a filter that fails open pushes more than intended and a
    // filter that succeeds deletes what it was meant to protect, so matching
    // nothing must never be the quiet outcome of a reasonable spelling.
    let dir: string

    before(() => {
      dir = mkdtempSync(join(tmpdir(), 'xano-filters-'))
      mkdirSync(join(dir, 'table'))
      mkdirSync(join(dir, 'realtime', 'server'), {recursive: true})
      writeFileSync(join(dir, 'table', 'book.xs'), 'table book {}')
      writeFileSync(join(dir, 'table', 'user.xs'), 'table user {}')
      writeFileSync(join(dir, 'realtime', 'server', 'main.xs'), 'realtime_server main {}')
    })

    after(() => {
      fs.rmSync(dir, {force: true, recursive: true})
    })

    it('expands a trailing slash into a recursive directory match', () => {
      expect(normalizeFilterPattern('table/', dir)).to.equal('table/**')
    })

    it('expands a bare directory name, which matchBase would test against the BASENAME', () => {
      expect(normalizeFilterPattern('table', dir)).to.equal('table/**')
    })

    it('expands a nested directory path', () => {
      expect(normalizeFilterPattern('realtime/server', dir)).to.equal('realtime/server/**')
    })

    it('leaves an explicit glob exactly as written', () => {
      expect(normalizeFilterPattern('table/**', dir)).to.equal('table/**')
      expect(normalizeFilterPattern('**/*.xs', dir)).to.equal('**/*.xs')
    })

    it('leaves a bare filename alone so matchBase can still match it anywhere', () => {
      expect(normalizeFilterPattern('book.xs', dir)).to.equal('book.xs')
    })

    it('leaves a pattern that names nothing in the tree alone', () => {
      expect(normalizeFilterPattern('nope', dir)).to.equal('nope')
    })
  })

  describe('applyFilters', () => {
    let dir: string
    let files: string[]

    before(() => {
      dir = mkdtempSync(join(tmpdir(), 'xano-apply-'))
      mkdirSync(join(dir, 'table'))
      mkdirSync(join(dir, 'api'))
      writeFileSync(join(dir, 'table', 'book.xs'), 'table book {}')
      writeFileSync(join(dir, 'table', 'user.xs'), 'table user {}')
      writeFileSync(join(dir, 'api', 'test.xs'), 'api_group test {}')
      files = [join(dir, 'table', 'book.xs'), join(dir, 'table', 'user.xs'), join(dir, 'api', 'test.xs')]
    })

    after(() => {
      fs.rmSync(dir, {force: true, recursive: true})
    })

    it('excludes a directory named with a trailing slash', () => {
      const kept = applyFilters(files, dir, undefined, ['table/'], () => {})
      expect(kept).to.deep.equal([join(dir, 'api', 'test.xs')])
    })

    it('excludes a directory named bare', () => {
      const kept = applyFilters(files, dir, undefined, ['table'], () => {})
      expect(kept).to.deep.equal([join(dir, 'api', 'test.xs')])
    })

    it('still honours an explicit glob', () => {
      const kept = applyFilters(files, dir, undefined, ['table/**'], () => {})
      expect(kept).to.deep.equal([join(dir, 'api', 'test.xs')])
    })

    it('includes a directory named bare', () => {
      const kept = applyFilters(files, dir, ['table'], undefined, () => {})
      expect(kept).to.have.lengthOf(2)
    })

    it('reports a pattern that matched nothing, so a typo is not silent', () => {
      const lines: string[] = []
      applyFilters(files, dir, undefined, ['nope'], (m) => lines.push(m))
      expect(lines.join('\n')).to.contain('matched 0 files')
    })

    it('reports a per-pattern count when the pattern does match', () => {
      const lines: string[] = []
      applyFilters(files, dir, undefined, ['table/**'], (m) => lines.push(m))
      expect(lines.join('\n')).to.contain('(2)')
      expect(lines.join('\n')).to.not.contain('matched 0 files')
    })
  })

  describe('the --include/--exclude delete guard', () => {
    // A filtered-out document is absent from the payload, so a --delete sweep
    // reads it as removed from the tree. -e means "don't touch these", which is
    // the opposite instruction, so the objects it names must be declared to the
    // server and the result verified.
    let dir: string
    let allFiles: string[]

    before(() => {
      dir = mkdtempSync(join(tmpdir(), 'xano-guard-'))
      mkdirSync(join(dir, 'table'))
      mkdirSync(join(dir, 'api'))
      writeFileSync(join(dir, 'table', 'book.xs'), 'table book {\n  guid = "GUID_BOOK"\n}')
      writeFileSync(join(dir, 'table', 'user.xs'), 'table user {\n}')
      writeFileSync(join(dir, 'api', 'seed_POST.xs'), 'query seed verb=POST {\n  guid = "GUID_SEED"\n}')
      allFiles = [
        join(dir, 'api', 'seed_POST.xs'),
        join(dir, 'table', 'book.xs'),
        join(dir, 'table', 'user.xs'),
      ]
    })

    after(() => {
      fs.rmSync(dir, {force: true, recursive: true})
    })

    it('describes the documents a filter removed, with their guids', () => {
      const kept = [join(dir, 'api', 'seed_POST.xs')]
      const out = describeFilteredOut(allFiles, kept, dir)

      expect(out.map((d) => d.key).sort()).to.deep.equal(['table:book', 'table:user'])
      expect(out.find((d) => d.name === 'book')?.guid).to.equal('GUID_BOOK')
      expect(out.find((d) => d.name === 'user')?.guid).to.equal(undefined)
    })

    it('reports nothing when nothing was filtered out', () => {
      expect(describeFilteredOut(allFiles, allFiles, dir)).to.deep.equal([])
    })

    it('keys a query by name AND verb, the way the preview reports it', () => {
      const out = describeFilteredOut(allFiles, [], dir)
      expect(out.map((d) => d.key)).to.include('query:seed POST')
    })

    it('flags a delete that would remove a filtered-out document', () => {
      const filteredOut = describeFilteredOut(allFiles, [join(dir, 'api', 'seed_POST.xs')], dir)
      const hits = deletesHittingFilteredOut(
        [
          {action: 'delete', name: 'user', type: 'table'},
          {action: 'update', name: 'seed POST', type: 'query'},
        ],
        filteredOut,
      )

      expect(hits).to.have.lengthOf(1)
      expect(hits[0].name).to.equal('user')
      expect(hits[0].relPath).to.contain('user.xs')
    })

    it('does not flag a delete for something that was never in the tree', () => {
      const filteredOut = describeFilteredOut(allFiles, [join(dir, 'api', 'seed_POST.xs')], dir)
      const hits = deletesHittingFilteredOut([{action: 'delete', name: 'orphan', type: 'table'}], filteredOut)

      expect(hits).to.deep.equal([])
    })

    it('ignores non-delete operations', () => {
      const filteredOut = describeFilteredOut(allFiles, [], dir)
      const hits = deletesHittingFilteredOut(
        [
          {action: 'update', name: 'user', type: 'table'},
          {action: 'create', name: 'book', type: 'table'},
        ],
        filteredOut,
      )

      expect(hits).to.deep.equal([])
    })

    it('catches a cascade_delete too', () => {
      const filteredOut = describeFilteredOut(allFiles, [], dir)
      const hits = deletesHittingFilteredOut([{action: 'cascade_delete', name: 'book', type: 'table'}], filteredOut)

      expect(hits).to.have.lengthOf(1)
    })

    it('matches a trigger against the generic `trigger` bucket the preview uses', () => {
      const triggerDir = mkdtempSync(join(tmpdir(), 'xano-guard-trig-'))
      writeFileSync(
        join(triggerDir, 'join.xs'),
        'channel_trigger rooms_join {\n  realtime_server = "main"\n  guid = "G"\n}',
      )
      const filteredOut = describeFilteredOut([join(triggerDir, 'join.xs')], [], triggerDir)
      const hits = deletesHittingFilteredOut([{action: 'delete', name: 'rooms_join', type: 'trigger'}], filteredOut)

      expect(hits).to.have.lengthOf(1)
      fs.rmSync(triggerDir, {force: true, recursive: true})
    })

it('declares protect_guids up to exactly the 4,000-char cap, and not one char past it', () => {
      // 100 guids of 39 chars plus 99 commas = 3,999; one more char on the last guid reaches 4,000.
      const docs = (lastExtra: string) =>
        Array.from({length: 100}, (_, i) => ({
          guid: `${String(i).padStart(39, '0')}${i === 99 ? lastExtra : ''}`,
          key: `table:t${i}`,
          name: `t${i}`,
          relPath: `table/t${i}.xs`,
          type: 'table',
        }))

      expect(protectGuidsFor(docs('')).length).to.equal(3999)
      expect(unprotectableFilteredOut(docs('x'))).to.deep.equal([])
      expect(protectGuidsFor(docs('x')).length).to.equal(4000)
      expect(unprotectableFilteredOut(docs('xy'))).to.deep.equal(['Too many filtered-out documents to declare in one request.'])
    })

    it('treats an empty guid as no guid, in the count and in protect_guids', () => {
      const docs = [
        {guid: '', key: 'table:a', name: 'a', relPath: 'table/a.xs', type: 'table'},
        {guid: 'G', key: 'table:b', name: 'b', relPath: 'table/b.xs', type: 'table'},
      ]

      expect(protectGuidsFor(docs)).to.equal('G')
      expect(unprotectableFilteredOut(docs)).to.deep.equal([
        '1 filtered-out document(s) have no guid yet, so the server cannot be told to spare them.',
      ])
    })

    it('returns nothing when there is no filter at all, so an unfiltered push is never blocked', () => {
      expect(deletesHittingFilteredOut([{action: 'delete', name: 'user', type: 'table'}], [])).to.deep.equal([])
    })
  })

  describe('parseExportDocuments', () => {
    it('splits a multidoc export into parsed documents', () => {
      const docs = parseExportDocuments(
        ['function foo {\n  guid = "abc"\n}', 'table bar {\n  guid = "def"\n}'].join('\n---\n'),
      )
      expect(docs).to.have.lengthOf(2)
      expect(docs[0].name).to.equal('foo')
      expect(docs[1].name).to.equal('bar')
    })
  })

  describe('selectWritebacks', () => {
    it('writes only pushed files whose content differs from the export', () => {
      const localFn = 'function foo {\n  var $x = 1\n}'
      const serverFn = 'function foo {\n  var $x = 1\n  guid = "abc"\n}'
      const result = selectWritebacks(
        parseExportDocuments([serverFn, 'function bar {\n  guid = "def"\n}'].join('\n---\n')),
        new Map([[keyFor(localFn), 'function/foo.xs']]),
        new Map([
          ['function/bar.xs', 'function bar {\n}'],
          ['function/foo.xs', localFn],
        ]),
        {includeRecords: false},
      )
      expect(result).to.have.lengthOf(1)
      expect(result[0].filePath).to.equal('function/foo.xs')
    })
  })

  describe('writeBackFormattedDocuments', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(join(tmpdir(), 'xano-writeback-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, {force: true, recursive: true})
    })

    it('writes the export onto the pushed file and reports duration', async () => {
      const filePath = join(tmpDir, 'foo.xs')
      const local = 'function foo {\n  var $x = 1\n}'
      const server = 'function foo {\n  var $x = 1\n  guid = "abc"\n}'
      fs.writeFileSync(filePath, local, 'utf8')

      const {command, logs} = stubCommand()
      const {elapsedMs} = await writeBackFormattedDocuments({
        accessToken: 'token',
        branch: '',
        command,
        includeEnv: false,
        includeRecords: false,
        pushedEntries: [{content: local, filePath}],
        target: workspaceTarget(),
        verbose: false,
        verboseFetch: mockFetch(200, server),
      })

      expect(fs.readFileSync(filePath, 'utf8')).to.equal(server)
      expect(logs[0]).to.match(/^Wrote 1 formatted file \(export \(\d+\.\d+s\)\)$/)
      expect(elapsedMs).to.be.at.least(0)
    })

    it('per-object writeback trims the server text instead of keeping its trailing newline', async () => {
      const filePath = join(tmpDir, 'foo.xs')
      const local = 'function foo {\n  var $x = 1\n}'
      const server = 'function foo {\n  var $x = 1\n  guid = "abc"\n}'
      fs.writeFileSync(filePath, local, 'utf8')
      const urls: string[] = []

      const {command, logs} = stubCommand()
      await writeBackFormattedDocuments({
        accessToken: 'token',
        branch: '',
        command,
        includeEnv: false,
        includeRecords: false,
        inputDir: tmpDir,
        isLiveBranch: true,
        pushedEntries: [{content: local, filePath}],
        resolvedTarget: FINGERPRINT,
        syncState: {...FINGERPRINT, files: {'foo.xs': {id: 7, key: keyFor(local), sha256: hashBytes(local)}}},
        target: workspaceTarget(),
        verbose: false,
        async verboseFetch(url: string) {
          urls.push(url)
          return jsonResponse(
            200,
            JSON.stringify({branch: FINGERPRINT.branch, xanoscript: {status: 'ok', value: `${server}\n\n`}}),
          )
        },
        workspaceId: '1',
      })

      expect(urls.some((url) => new URL(url).pathname.endsWith('/workspace/1/function/7'))).to.equal(true)
      expect(logs[0]).to.match(/per-object/)
      expect(fs.readFileSync(filePath, 'utf8')).to.equal(server)
    })

    it('a writebackObjectLimit of 0 goes straight to the export without a warning', async () => {
      const filePath = join(tmpDir, 'foo.xs')
      const local = 'function foo {\n  var $x = 1\n}'
      const server = 'function foo {\n  var $x = 1\n  guid = "abc"\n}'
      fs.writeFileSync(filePath, local, 'utf8')
      const urls: string[] = []

      const {command, logs, warns} = stubCommand()
      await writeBackFormattedDocuments({
        accessToken: 'token',
        branch: '',
        command,
        includeEnv: false,
        includeRecords: false,
        inputDir: tmpDir,
        isLiveBranch: true,
        pushedEntries: [{content: local, filePath}],
        resolvedTarget: FINGERPRINT,
        syncState: {...FINGERPRINT, files: {'foo.xs': {id: 7, key: keyFor(local), sha256: hashBytes(local)}}},
        target: workspaceTarget(),
        verbose: false,
        async verboseFetch(url: string) {
          urls.push(url)
          return jsonResponse(200, server)
        },
        workspaceId: '1',
        writebackObjectLimit: 0,
      })

      expect(urls).to.have.lengthOf(1)
      expect(new URL(urls[0]).pathname).to.match(/\/multidoc$/)
      expect(warns).to.deep.equal([])
      expect(logs[0]).to.match(/\(export /)
      expect(fs.readFileSync(filePath, 'utf8')).to.equal(server)
    })

    it('always sends branch on workspace export, even when empty', async () => {
      const filePath = join(tmpDir, 'foo.xs')
      fs.writeFileSync(filePath, 'function foo {\n}\n', 'utf8')
      const urls: string[] = []

      await writeBackFormattedDocuments({
        accessToken: 'token',
        branch: '',
        command: stubCommand().command,
        includeEnv: false,
        includeRecords: false,
        pushedEntries: [{content: 'function foo {\n}', filePath}],
        target: workspaceTarget(),
        verbose: false,
        async verboseFetch(url: string) {
          urls.push(url)
          return jsonResponse(200, 'function foo {\n}')
        },
      })

      expect(urls).to.have.lengthOf(1)
      const params = new URL(urls[0]).searchParams
      expect(params.get('branch')).to.equal('')
      expect(params.get('include_draft')).to.equal('false')
    })

    it('omits branch on sandbox export', async () => {
      const filePath = join(tmpDir, 'foo.xs')
      fs.writeFileSync(filePath, 'function foo {\n}\n', 'utf8')
      const urls: string[] = []

      await writeBackFormattedDocuments({
        accessToken: 'token',
        branch: 'dev',
        command: stubCommand().command,
        includeEnv: false,
        includeRecords: false,
        pushedEntries: [{content: 'function foo {\n}', filePath}],
        target: sandboxTarget(),
        verbose: false,
        async verboseFetch(url: string) {
          urls.push(url)
          return jsonResponse(200, 'function foo {\n}')
        },
      })

      expect(new URL(urls[0]).searchParams.has('branch')).to.equal(false)
    })

    it('warns on a failed export and does not write', async () => {
      const filePath = join(tmpDir, 'foo.xs')
      const local = 'function foo {\n  var $x = 1\n}'
      fs.writeFileSync(filePath, local, 'utf8')
      const {command, warns} = stubCommand()

      await writeBackFormattedDocuments({
        accessToken: 'token',
        branch: 'live',
        command,
        includeEnv: false,
        includeRecords: false,
        pushedEntries: [{content: local, filePath}],
        target: workspaceTarget(),
        verbose: false,
        verboseFetch: mockFetch(500, 'nope'),
      })

      expect(fs.readFileSync(filePath, 'utf8')).to.equal(local)
      expect(warns[0]).to.include('Failed to fetch server-formatted documents for writeback (500)')
    })

    it('saves local and server copies when writebackDiff is set', async () => {
      const filePath = join(tmpDir, 'function', 'foo.xs')
      fs.mkdirSync(join(tmpDir, 'function'))
      const local = 'function foo {\n  var $x = 1\n}'
      const server = 'function foo {\n  var $x = 1\n  guid = "abc"\n}'
      fs.writeFileSync(filePath, local, 'utf8')
      const diffDir = join(tmpDir, 'diffs')

      await writeBackFormattedDocuments({
        accessToken: 'token',
        branch: '',
        command: stubCommand().command,
        includeEnv: false,
        includeRecords: false,
        inputDir: tmpDir,
        pushedEntries: [{content: local, filePath}],
        target: workspaceTarget(),
        verbose: false,
        verboseFetch: mockFetch(200, server),
        writebackDiff: diffDir,
      })

      expect(fs.readFileSync(join(diffDir, 'function/foo.xs.local.xs'), 'utf8')).to.equal(local)
      expect(fs.readFileSync(join(diffDir, 'function/foo.xs.server.xs'), 'utf8')).to.equal(server)
    })

    it('does not overwrite a file edited while the server copy was being fetched', async () => {
      const filePath = join(tmpDir, 'foo.xs')
      const local = 'function foo {\n  var $x = 1\n}'
      const edited = 'function foo {\n  var $x = 2\n}'
      fs.writeFileSync(filePath, local, 'utf8')

      const {command, warns} = stubCommand()
      const {written} = await writeBackFormattedDocuments({
        accessToken: 'token',
        branch: '',
        command,
        includeEnv: false,
        includeRecords: false,
        inputDir: tmpDir,
        pushedBytes: new Map([[filePath, local]]),
        pushedEntries: [{content: local, filePath}],
        target: workspaceTarget(),
        verbose: false,
        async verboseFetch() {
          fs.writeFileSync(filePath, edited, 'utf8')
          return jsonResponse(200, 'function foo {\n  var $x = 1\n  // formatted\n}')
        },
      })

      expect(fs.readFileSync(filePath, 'utf8')).to.equal(edited)
      expect(written).to.deep.equal([])
      expect(warns.some((line) => line.includes('foo.xs') && line.includes('changed'))).to.equal(true)
    })
  })

  describe('executePush --fast', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(join(tmpdir(), 'xano-fast-push-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, {force: true, recursive: true})
  })

  it('sends only candidates to the dry-run and the push', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    writeXs(tmpDir, 'function/bar.xs', 'function bar {\n}')
    seedRecord(tmpDir, {
      'function/bar.xs': hashFile(join(tmpDir, 'function/bar.xs')),
      'function/foo.xs': hashBytes('stale'),
    })

    const {bodies, calls, logs} = await runPush(tmpDir, {fast: true, force: true})
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('function foo')
    expect(post?.body).to.not.include('function bar')
    expect(bodies.export).to.equal(undefined)
    expect(logs.some((line) => line.includes('Pushed'))).to.equal(true)
  })

  it('records the post-GUID hash so a new file is not resent', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    const {calls: first} = await runPush(tmpDir, {fast: true, force: true, guid: 'abc'})
    expect(first.some((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))).to.equal(true)

    const {calls: second} = await runPush(tmpDir, {fast: true, force: true, guid: 'abc'})
    expect(
      second.some((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run')),
    ).to.equal(false)
  })

  it('with --no-guids, a new file is sent once then not again', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    await runPush(tmpDir, {fast: true, force: true, guids: false})
    const {calls} = await runPush(tmpDir, {fast: true, force: true, guids: false})
    expect(
      calls.some((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run')),
    ).to.equal(false)
  })

  it('a push without --fast does not write the record', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    await runPush(tmpDir, {force: true})
    expect(fs.existsSync(join(tmpDir, '.xano', 'sync_state.json'))).to.equal(false)
  })

    it('a push without --fast does not fetch workspace fingerprints', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    const {calls} = await runPush(tmpDir, {force: true})
    expect(calls.some((call) => call.url.includes('/workspace/1') && !call.url.includes('/multidoc'))).to.equal(false)
  })

  it('a push without --fast updates an existing record', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    seedRecord(tmpDir, {'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs'))})
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 2\n}')
    await runPush(tmpDir, {force: true})
    const raw = JSON.parse(fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json'), 'utf8')) as {
      targets: Array<{files: Record<string, {sha256: string}>}>
    }
    expect(raw.targets[0].files['function/foo.xs'].sha256).to.equal(hashFile(join(tmpDir, 'function/foo.xs')))
  })

  it('a push without --fast still updates the record so a revert is sent on --fast', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    seedRecord(tmpDir, {'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs'))})
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 2\n}')
    await runPush(tmpDir, {force: true})
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    const {calls} = await runPush(tmpDir, {fast: true, force: true})
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('var $x = 1')
  })

  it('dry-run without --fast leaves an existing record unchanged', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    seedRecord(tmpDir, {'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs'))})
    const before = fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json'))
    await runPush(tmpDir, {dryRun: true})
    expect(fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json')).equals(before)).to.equal(true)
  })

  it('deleting the record between --fast pushes compares against the export', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    writeXs(tmpDir, 'function/bar.xs', 'function bar {\n}')
    await runPush(tmpDir, {fast: true, force: true})
    fs.rmSync(join(tmpDir, '.xano'), {force: true, recursive: true})
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 2\n}')
    const {calls} = await runPush(tmpDir, {
      exportBody: ['function foo {\n  var $x = 1\n}', 'function bar {\n}'].join('\n---\n'),
      fast: true,
      force: true,
    })
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('function foo')
    expect(post?.body).to.not.include('function bar')
    expect(fs.existsSync(join(tmpDir, '.xano', 'sync_state.json'))).to.equal(true)
  })

  it('a partial record sends every file without an entry', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    writeXs(tmpDir, 'function/bar.xs', 'function bar {\n}')
    seedRecord(tmpDir, {
      'function/bar.xs': hashFile(join(tmpDir, 'function/bar.xs')),
    })
    const {calls} = await runPush(tmpDir, {fast: true, force: true})
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('function foo')
    expect(post?.body).to.not.include('function bar')
  })

  it('the deleted-locally note respects -i/-e', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    seedRecord(tmpDir, {
      'function/foo.xs': hashBytes('old'),
      'function/gone.xs': hashBytes('gone'),
      'table/users.xs': hashBytes('gone-table'),
    })
    const {logs} = await runPush(tmpDir, {exclude: ['table/*'], fast: true, force: true})
    const note = logs.find((line) => line.includes('deleted locally'))
    expect(note).to.include('1 file')
  })

  it('switching branches keeps each branch section separate', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    await runPush(tmpDir, {branch: 'v1', fast: true, force: true})
    await runPush(tmpDir, {branch: 'v2', fast: true, force: true, live: 'v1'})
    const raw = JSON.parse(fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json'), 'utf8')) as {
      targets: Array<{branch: string}>
    }
    expect(raw.targets.map((t) => t.branch).sort()).to.deep.equal(['v1', 'v2'])
  })

  it('a missing record with an export failure falls back to the full dry-run', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    writeXs(tmpDir, 'function/bar.xs', 'function bar {\n}')
    const {calls, warns} = await runPush(tmpDir, {exportStatus: 500, fast: true, force: true})
    expect(warns.some((line) => line.includes('falling back to a full dry-run'))).to.equal(true)
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('function foo')
    expect(post?.body).to.include('function bar')
  })

  it('an export comparison with nothing different saves the record and does not push', async () => {
    const content = 'function foo {\n}'
    writeXs(tmpDir, 'function/foo.xs', content)
    const {calls} = await runPush(tmpDir, {exportBody: content, fast: true, force: true})
    expect(
      calls.some((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run')),
    ).to.equal(false)
    expect(fs.existsSync(join(tmpDir, '.xano', 'sync_state.json'))).to.equal(true)
  })

  it('warns and still reports no changes when saving the sync record fails', async () => {
    const content = 'function foo {\n}'
    writeXs(tmpDir, 'function/foo.xs', content)
    const stateDir = join(tmpDir, '.xano')
    fs.mkdirSync(stateDir)
    fs.mkdirSync(join(stateDir, 'sync_state.json'))
    const {logs, warns} = await runPush(tmpDir, {exportBody: content, fast: true, force: true})
    expect(logs.some((line) => line.includes('No changes to push.'))).to.equal(true)
    expect(warns.some((line) => line.includes('Skipped writing .xano/sync_state.json'))).to.equal(true)
  })

  it('warns and still reports a successful push when saving the sync record fails', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    const stateDir = join(tmpDir, '.xano')
    fs.mkdirSync(stateDir)
    fs.mkdirSync(join(stateDir, 'sync_state.json'))
    const {logs, warns} = await runPush(tmpDir, {fast: true, force: true})
    expect(logs.some((line) => line.includes('Pushed'))).to.equal(true)
    expect(warns.some((line) => line.includes('Skipped writing .xano/sync_state.json'))).to.equal(true)
  })

  it('--refresh with a valid record still runs the export comparison', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    seedRecord(tmpDir, {'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs'))})
    const {calls} = await runPush(tmpDir, {
      exportBody: 'function foo {\n  var $x = 2\n}',
      fast: true,
      force: true,
      refresh: true,
    })
    expect(calls.some((call) => call.method === 'GET' && call.url.includes('/multidoc'))).to.equal(true)
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('function foo')
  })

  it('--refresh without --fast errors', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    try {
      await runPush(tmpDir, {force: true, refresh: true})
      expect.fail('expected error')
    } catch (error) {
      expect((error as Error).message).to.include('--refresh requires --fast')
    }
  })

  it('no candidates means no network call besides fingerprints', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    seedRecord(tmpDir, {'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs'))})
    const {calls, logs} = await runPush(tmpDir, {fast: true, force: true})
    expect(calls.every((call) => call.url.includes('/workspace/1') && !call.url.includes('/multidoc'))).to.equal(true)
    expect(logs.some((line) => line.includes('No local changes since last sync'))).to.equal(true)
  })

  it('--fast with --sync errors', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    try {
      await runPush(tmpDir, {fast: true, force: true, sync: true})
      expect.fail('expected error')
    } catch (error) {
      expect((error as Error).message).to.include('--fast cannot be used with --sync')
    }
  })

  it('does not write the record on dry-run', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    await runPush(tmpDir, {dryRun: true, exportBody: 'function foo {\n  guid = "x"\n}', fast: true})
    expect(fs.existsSync(join(tmpDir, '.xano', 'sync_state.json'))).to.equal(false)
  })

  it('records the bytes that were pushed, not an edit made while the push ran', async () => {
    const fooPath = writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    const edited = 'function foo {\n  var $x = 2\n}'
    await runPush(tmpDir, {
      fast: true,
      force: true,
      onPost() {
        fs.writeFileSync(fooPath, edited, 'utf8')
      },
    })
    expect(loadedFiles(tmpDir)['function/foo.xs'].sha256).to.equal(hashBytes('function foo {\n  var $x = 1\n}'))

    const {calls} = await runPush(tmpDir, {fast: true, force: true})
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('var $x = 2')
  })

  it('records the post-GUID bytes of what was pushed when the file changed during the push', async () => {
    const fooPath = writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    await runPush(tmpDir, {
      fast: true,
      force: true,
      guid: 'abc',
      onPost() {
        fs.writeFileSync(fooPath, 'function foo {\n  var $x = 2\n}', 'utf8')
      },
    })
    expect(loadedFiles(tmpDir)['function/foo.xs'].sha256).to.equal(hashBytes('function foo {\n  guid = "abc"\n}'))
  })

  it('writeback skips a file edited while the push ran', async () => {
    const fooPath = writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    const edited = 'function foo {\n  var $x = 2\n}'
    const {warns} = await runPush(tmpDir, {
      exportBody: 'function foo {\n  var $x = 1\n  // formatted\n}',
      fast: true,
      force: true,
      onPost() {
        fs.writeFileSync(fooPath, edited, 'utf8')
      },
      writeback: true,
    })
    expect(fs.readFileSync(fooPath, 'utf8')).to.equal(edited)
    expect(warns.some((line) => line.includes('function/foo.xs') && line.includes('changed'))).to.equal(true)
  })

  it('writeback updates the record to the rewritten bytes', async () => {
    const fooPath = writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    const server = 'function foo {\n  var $x = 1\n  // formatted\n}'
    await runPush(tmpDir, {exportBody: server, fast: true, force: true, writeback: true})
    expect(fs.readFileSync(fooPath, 'utf8')).to.equal(server)
    expect(loadedFiles(tmpDir)['function/foo.xs'].sha256).to.equal(hashBytes(server))
  })

  it('--records sends a table with items even when its hash matches a record written without --records', async () => {
    const table = 'table users {\n  schema {\n    int id\n  }\n\n  items = [\n    {"id": 1}\n  ]\n}'
    writeXs(tmpDir, 'table/users.xs', table)
    await runPush(tmpDir, {fast: true, force: true, unchanged: true})
    expect(loadedFiles(tmpDir)['table/users.xs'].sha256).to.equal(hashBytes(table))

    const {calls} = await runPush(tmpDir, {fast: true, force: true, records: true, unchanged: true})
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('table users')
    expect(post?.url).to.include('records=true')
  })

  it('--records adds tables with items to the export-comparison candidates', async () => {
    const table = 'table users {\n  schema {\n    int id\n  }\n\n  items = [\n    {"id": 1}\n  ]\n}'
    writeXs(tmpDir, 'table/users.xs', table)
    const {calls} = await runPush(tmpDir, {exportBody: table, fast: true, force: true, records: true, unchanged: true})
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('table users')
  })

  it('--env sends every file to the dry-run even when the record matches', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    seedRecord(tmpDir, {'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs'))})
    const {calls} = await runPush(tmpDir, {env: true, fast: true, force: true})
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('function foo')
    expect(post?.url).to.include('env=true')
  })

  it('a filtered --refresh keeps record entries outside the filter', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
    writeXs(tmpDir, 'function/bar.xs', 'function bar {\n}')
    seedRecord(tmpDir, {
      'function/bar.xs': hashFile(join(tmpDir, 'function/bar.xs')),
      'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs')),
    })
    const {calls} = await runPush(tmpDir, {
      exportBody: 'function foo {\n  var $x = 2\n}',
      fast: true,
      force: true,
      include: ['function/foo.xs'],
      refresh: true,
    })
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
    expect(post?.body).to.include('function foo')
    expect(post?.body).to.not.include('function bar')
    expect(loadedFiles(tmpDir)['function/bar.xs']).to.not.equal(undefined)
    expect(loadedFiles(tmpDir)['function/foo.xs'].sha256).to.equal(hashFile(join(tmpDir, 'function/foo.xs')))
  })

  it('a thrown per-object fetch falls back to the export and the push still finishes', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    const server = 'function foo {\n  // formatted\n}'
    const {logs, warns} = await runPush(tmpDir, {
      exportBody: server,
      fast: true,
      force: true,
      perObject: 'throw',
      writeback: true,
    })
    expect(warns.some((line) => line.includes('Per-object writeback unavailable') && line.includes('socket hang up'))).to.equal(true)
    expect(fs.readFileSync(join(tmpDir, 'function/foo.xs'), 'utf8')).to.equal(server)
    expect(logs.some((line) => line.includes('Pushed'))).to.equal(true)
  })

  it('saves object ids found during per-object writeback', async () => {
    writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
    await runPush(tmpDir, {fast: true, force: true, perObject: 'ok', writeback: true})
    const raw = JSON.parse(fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json'), 'utf8')) as {
      targets: Array<{files: Record<string, {id?: number; sha256: string}>}>
    }
    expect(raw.targets[0].files['function/foo.xs'].id).to.equal(7)
    expect(raw.targets[0].files['function/foo.xs'].sha256).to.equal(hashBytes('function foo {\n  // formatted\n}'))
  })
  })

  describe('executePush --sync --delete prune', () => {
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(join(tmpdir(), 'xano-sync-delete-prune-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, {force: true, recursive: true})
    })

    it('removes the missing entry after a successful --sync --delete push', async () => {
      seedWithGone(tmpDir)
      const {logs} = await runPush(tmpDir, {delete: true, force: true, sync: true})
      expect(logs.some((line) => line.includes('Pushed'))).to.equal(true)
      const files = loadedFiles(tmpDir)
      expect(files['function/gone.xs']).to.equal(undefined)
      expect(files['function/foo.xs']).to.not.equal(undefined)
    })

    it('removes the missing entry when --sync --delete reports no changes', async () => {
      seedWithGone(tmpDir)
      const {logs} = await runPush(tmpDir, {delete: true, sync: true, unchanged: true})
      expect(logs.some((line) => line.includes('No changes to push.'))).to.equal(true)
      const files = loadedFiles(tmpDir)
      expect(files['function/gone.xs']).to.equal(undefined)
      expect(files['function/foo.xs']).to.not.equal(undefined)
    })

    it('keeps the missing entry after --sync without --delete', async () => {
      seedWithGone(tmpDir)
      await runPush(tmpDir, {force: true, sync: true})
      expect(loadedFiles(tmpDir)['function/gone.xs']).to.not.equal(undefined)
    })

    it('keeps the missing entry on --fast and still logs the deleted-locally note', async () => {
      seedWithGone(tmpDir)
      const {logs} = await runPush(tmpDir, {fast: true, force: true})
      expect(logs.some((line) => line.includes('deleted locally'))).to.equal(true)
      expect(loadedFiles(tmpDir)['function/gone.xs']).to.not.equal(undefined)
    })

    it('leaves the record unchanged on --sync --delete --dry-run', async () => {
      seedWithGone(tmpDir)
      const before = fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json'))
      await runPush(tmpDir, {delete: true, dryRun: true, sync: true})
      expect(fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json')).equals(before)).to.equal(true)
    })
  })

  describe('executePush sandbox --fast', () => {
    let tmpDir: string
    let markerDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(join(tmpdir(), 'xano-sandbox-fast-'))
      markerDir = fs.mkdtempSync(join(tmpdir(), 'xano-sandbox-marker-'))
    })

    afterEach(() => {
      fs.rmSync(tmpDir, {force: true, recursive: true})
      fs.rmSync(markerDir, {force: true, recursive: true})
    })

    it('a first --fast push with no marker writes the marker and record', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
      await runPush(tmpDir, {fast: true, force: true, kind: 'sandbox', markerDir})
      expect(sandboxMarkerExists(markerDir)).to.equal(true)
      expect(fs.existsSync(join(tmpDir, '.xano', 'sync_state.json'))).to.equal(true)
      const identity = sandboxFingerprint()
      expect(readMarkerToken(markerDir, identity.instance_host, identity.branch_created_at)).to.be.a('string')
    })

    it('writes the marker and record before writeback so a failed writeback keeps --fast state', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
      try {
        await runPush(tmpDir, {exportTextThrows: true, fast: true, force: true, kind: 'sandbox', markerDir, writeback: true})
        expect.fail('expected writeback to throw')
      } catch (error) {
        expect((error as Error).message).to.include('connection reset')
      }

      const identity = sandboxFingerprint()
      const token = readMarkerToken(markerDir, identity.instance_host, identity.branch_created_at)
      expect(token).to.be.a('string')
      const raw = JSON.parse(fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json'), 'utf8')) as {
        targets: Array<{files: Record<string, unknown>; sandbox_token?: string}>
      }
      expect(raw.targets[0].sandbox_token).to.equal(token)
      expect(raw.targets[0].files['function/foo.xs']).to.not.equal(undefined)
    })

    it('sends only candidates when the marker token matches', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
      writeXs(tmpDir, 'function/bar.xs', 'function bar {\n}')
      seedSandboxRecord(tmpDir, markerDir, {
        'function/bar.xs': hashFile(join(tmpDir, 'function/bar.xs')),
        'function/foo.xs': hashBytes('stale'),
      })
      const {bodies, calls, logs} = await runPush(tmpDir, {fast: true, force: true, kind: 'sandbox', markerDir})
      const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
      expect(post?.body).to.include('function foo')
      expect(post?.body).to.not.include('function bar')
      expect(bodies.export).to.equal(undefined)
      expect(logs.some((line) => line.includes('Pushed'))).to.equal(true)
    })

    it('compares against the export when the marker token does not match', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
      seedSandboxRecord(tmpDir, markerDir, {'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs'))}, 'old-token')
      const {calls, logs} = await runPush(tmpDir, {
        exportBody: 'function foo {\n  var $x = 0\n}',
        fast: true,
        force: true,
        kind: 'sandbox',
        markerDir,
      })
      expect(logs.some((line) => line.includes('Sandbox changed since this directory'))).to.equal(true)
      const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
      expect(post?.body).to.include('var $x = 1')
    })

    it('compares against the export when the marker is missing', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
      seedSandboxRecord(tmpDir, markerDir, {'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs'))})
      fs.rmSync(join(markerDir, 'sandbox_sync.json'))
      const {calls, logs} = await runPush(tmpDir, {
        exportBody: 'function foo {\n  var $x = 0\n}',
        fast: true,
        force: true,
        kind: 'sandbox',
        markerDir,
      })
      expect(logs.some((line) => line.includes('Sandbox changed since this directory'))).to.equal(true)
      const post = calls.find((call) => call.method === 'POST' && call.url.includes('/multidoc') && !call.url.includes('dry-run'))
      expect(post?.body).to.include('function foo')
    })

    it('rotates the token in the marker and the record after a successful push', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
      const oldToken = seedSandboxRecord(tmpDir, markerDir, {'function/foo.xs': hashBytes('stale')})
      await runPush(tmpDir, {fast: true, force: true, kind: 'sandbox', markerDir})
      const identity = sandboxFingerprint()
      const newToken = readMarkerToken(markerDir, identity.instance_host, identity.branch_created_at)
      expect(newToken).to.be.a('string')
      expect(newToken).to.not.equal(oldToken)
      const raw = JSON.parse(fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json'), 'utf8')) as {
        targets: Array<{sandbox_token?: string}>
      }
      expect(raw.targets[0].sandbox_token).to.equal(newToken)
    })

    it('clears the marker entry when the POST fails', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
      seedSandboxRecord(tmpDir, markerDir, {'function/foo.xs': hashBytes('stale')})
      try {
        await runPush(tmpDir, {fast: true, force: true, kind: 'sandbox', markerDir, postStatus: 500})
        expect.fail('expected error')
      } catch (error) {
        expect((error as Error).message).to.match(/Push failed|500/)
      }

      expect(readMarkerToken(markerDir, 'example.test', 3)).to.equal(null)
      expect(loadedFiles(tmpDir)['function/foo.xs'].sha256).to.equal(hashBytes('stale'))
    })

    it('a filtered rebuild of an untrusted sandbox record drops entries outside the filter', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  var $x = 1\n}')
      writeXs(tmpDir, 'function/bar.xs', 'function bar {\n}')
      seedSandboxRecord(
        tmpDir,
        markerDir,
        {
          'function/bar.xs': hashFile(join(tmpDir, 'function/bar.xs')),
          'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs')),
        },
        'old-token',
      )
      await runPush(tmpDir, {
        exportBody: 'function foo {\n  var $x = 0\n}',
        fast: true,
        force: true,
        include: ['function/foo.xs'],
        kind: 'sandbox',
        markerDir,
      })
      expect(loadedFiles(tmpDir)['function/bar.xs']).to.equal(undefined)
      expect(loadedFiles(tmpDir)['function/foo.xs']).to.not.equal(undefined)
    })

    it('a default push with no record and no marker does not call /sandbox/me or write files', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
      const {calls} = await runPush(tmpDir, {force: true, kind: 'sandbox', markerDir})
      expect(calls.some((call) => call.url.includes('/sandbox/me'))).to.equal(false)
      expect(fs.existsSync(join(tmpDir, '.xano', 'sync_state.json'))).to.equal(false)
      expect(sandboxMarkerExists(markerDir)).to.equal(false)
    })

    it('a default push with a marker but no record invalidates the host', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
      writeMarkerToken(markerDir, 'example.test', 3)
      await runPush(tmpDir, {force: true, kind: 'sandbox', markerDir})
      expect(readMarkerToken(markerDir, 'example.test', 3)).to.equal(null)
      expect(fs.existsSync(join(tmpDir, '.xano', 'sync_state.json'))).to.equal(false)
    })

    it('dry-run leaves the record and marker unchanged', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
      seedSandboxRecord(tmpDir, markerDir, {'function/foo.xs': hashFile(join(tmpDir, 'function/foo.xs'))})
      const recordBefore = fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json'))
      const markerBefore = fs.readFileSync(join(markerDir, 'sandbox_sync.json'))
      await runPush(tmpDir, {dryRun: true, kind: 'sandbox', markerDir})
      expect(fs.readFileSync(join(tmpDir, '.xano', 'sync_state.json')).equals(recordBefore)).to.equal(true)
      expect(fs.readFileSync(join(markerDir, 'sandbox_sync.json')).equals(markerBefore)).to.equal(true)
    })

    it('writeback uses the sandbox export URL', async () => {
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n}')
      const {calls} = await runPush(tmpDir, {fast: true, force: true, kind: 'sandbox', markerDir, writeback: true})
      expect(calls.some((call) => call.method === 'GET' && call.url.includes('/sandbox/multidoc'))).to.equal(true)
      expect(calls.some((call) => call.url.includes('/workspace/'))).to.equal(false)
    })
  })

  describe('executePush --sync --delete with a filter (DEV-8963)', () => {
    // A filtered-out document is absent from the payload, so the delete sweep
    // would remove it. --force skips the preview, and the preview is where the
    // guard runs, so --force must still refuse or verify before any delete push.
    let tmpDir: string

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(join(tmpdir(), 'xano-filter-delete-'))
      writeXs(tmpDir, 'function/foo.xs', 'function foo {\n  guid = "GUID_FOO"\n}')
    })

    afterEach(() => {
      fs.rmSync(tmpDir, {force: true, recursive: true})
    })

    it('refuses --force before any request when the filtered-out guids exceed the protect_guids cap', async () => {
      for (let i = 0; i < 150; i++) {
        writeXs(tmpDir, `table/t${i}.xs`, `table t${i} {\n  guid = "guid-${String(i).padStart(4, '0')}-${'x'.repeat(26)}"\n}`)
      }

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, exclude: ['table/*'], force: true})

      expect(error?.message).to.contain('Too many filtered-out documents to declare in one request.')
      expect(error?.message).to.contain('Re-run without --delete, or without the --include/--exclude filter.')
      expect(calls).to.deep.equal([])
    })

    it('refuses --force before any request when a filtered-out document has no guid', async () => {
      writeXs(tmpDir, 'table/book.xs', 'table book {\n  guid = "GUID_BOOK"\n}')
      writeXs(tmpDir, 'table/user.xs', 'table user {\n}')
      writeXs(tmpDir, 'table/order.xs', 'table order {\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, exclude: ['table/*'], force: true})

      expect(error?.message).to.contain('2 filtered-out document(s) have no guid yet')
      expect(error?.message).to.not.contain('Too many')
      expect(calls).to.deep.equal([])
    })

    it('checks the preview under --force and refuses when it still deletes a filtered-out object', async () => {
      writeXs(tmpDir, 'table/book.xs', 'table book {\n  guid = "GUID_BOOK"\n}')

      const {calls, error, logs} = await runFilteredPush(tmpDir, {
        delete: true,
        exclude: ['table/*'],
        force: true,
        operations: [
          {action: 'unchanged', details: '', name: 'foo', type: 'function'},
          {action: 'delete', details: '', name: 'book', type: 'table'},
        ],
      })

      expect(error?.message).to.equal('Re-run without --delete, or without the --include/--exclude filter.')
      expect(logs).to.include('--- Refusing to push ---')
      expect(logs.some((line) => line.includes('DELETE') && line.includes('book'))).to.equal(true)
      expect(previews(calls)).to.have.lengthOf(1)
      expect(new URL(previews(calls)[0].url).searchParams.get('protect_guids')).to.equal('GUID_BOOK')
      expect(pushes(calls)).to.deep.equal([])
    })

    it('pushes under --force, without a prompt, when the preview spares every filtered-out object', async () => {
      writeXs(tmpDir, 'table/book.xs', 'table book {\n  guid = "GUID_BOOK"\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, exclude: ['table/*'], force: true})

      expect(error).to.equal(undefined)
      expect(previews(calls)).to.have.lengthOf(1)
      expect(pushes(calls)).to.have.lengthOf(1)
      const pushUrl = new URL(pushes(calls)[0].url)
      expect(pushUrl.searchParams.get('delete')).to.equal('true')
      expect(pushUrl.searchParams.get('protect_guids')).to.equal('GUID_BOOK')
    })

    it('refuses under --force when the preview fails', async () => {
      writeXs(tmpDir, 'table/book.xs', 'table book {\n  guid = "GUID_BOOK"\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {
        delete: true,
        dryRunBody: JSON.stringify({message: 'Internal error.'}),
        dryRunStatus: 500,
        exclude: ['table/*'],
        force: true,
      })

      expect(error?.message).to.contain('The push preview failed (500): Internal error')
      expect(error?.message).to.contain('Re-run without --delete')
      expect(pushes(calls)).to.deep.equal([])
    })

    it('refuses under --force when the preview request throws', async () => {
      writeXs(tmpDir, 'table/book.xs', 'table book {\n  guid = "GUID_BOOK"\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, dryRunThrows: true, exclude: ['table/*'], force: true})

      expect(error?.message).to.contain('The push preview failed (socket hang up)')
      expect(pushes(calls)).to.deep.equal([])
    })

    it('refuses under --force when the instance returns no preview operations', async () => {
      writeXs(tmpDir, 'table/book.xs', 'table book {\n  guid = "GUID_BOOK"\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, dryRunBody: '{}', exclude: ['table/*'], force: true})

      expect(error?.message).to.contain('This instance returned no push preview')
      expect(pushes(calls)).to.deep.equal([])
    })

    it('still lets a server policy-plan refusal speak for itself under --force', async () => {
      writeXs(tmpDir, 'table/book.xs', 'table book {\n  guid = "GUID_BOOK"\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {
        delete: true,
        dryRunBody: JSON.stringify({message: 'Your plan allows 1 policy.', payload: {code: 'policy_plan_limit'}}),
        dryRunStatus: 403,
        exclude: ['table/*'],
        force: true,
      })

      expect(error?.message).to.equal('Push refused (403): Your plan allows 1 policy.')
      expect(pushes(calls)).to.deep.equal([])
    })

    it('leaves --force without --delete alone: no preview, no refusal', async () => {
      writeXs(tmpDir, 'table/user.xs', 'table user {\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: false, exclude: ['table/*'], force: true})

      expect(error).to.equal(undefined)
      expect(previews(calls)).to.deep.equal([])
      expect(pushes(calls)).to.have.lengthOf(1)
    })

    it('leaves --force --delete without a filter alone: no preview, no refusal', async () => {
      writeXs(tmpDir, 'table/user.xs', 'table user {\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, force: true})

      expect(error).to.equal(undefined)
      expect(previews(calls)).to.deep.equal([])
      expect(pushes(calls)).to.have.lengthOf(1)
    })

    it('leaves --force --delete alone when the filter removes nothing', async () => {
      writeXs(tmpDir, 'table/user.xs', 'table user {\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, exclude: ['nothing/*'], force: true})

      expect(error).to.equal(undefined)
      expect(previews(calls)).to.deep.equal([])
      expect(pushes(calls)).to.have.lengthOf(1)
    })

    it('does not refuse up front without --force: the preview decides, as before', async () => {
      writeXs(tmpDir, 'table/user.xs', 'table user {\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, exclude: ['table/*']})

      // The preview spares the table, so the guard passes and the run stops at
      // the confirmation a non-interactive shell cannot give.
      expect(previews(calls)).to.have.lengthOf(1)
      expect(error?.message).to.equal('Non-interactive environment detected. Use --force to skip confirmation.')
      expect(pushes(calls)).to.deep.equal([])
    })

    it('keeps the non-force refusal output unchanged', async () => {
      writeXs(tmpDir, 'table/user.xs', 'table user {\n}')

      const {error, logs} = await runFilteredPush(tmpDir, {
        delete: true,
        exclude: ['table/*'],
        operations: [{action: 'delete', details: '', name: 'user', type: 'table'}],
      })

      const refusal = logs.slice(logs.indexOf('--- Refusing to push ---') - 1)
      expect(refusal).to.deep.equal([
        '',
        '--- Refusing to push ---',
        '',
        '  --delete would remove 1 object(s) that --include/--exclude filtered out:',
        '',
        `  ${'DELETE'.padEnd(8)} ${'table'.padEnd(18)} user  (${join('table', 'user.xs')})`,
        '',
        '  1 filtered-out document(s) have no guid yet, so the server cannot be told to spare them.',
        '  This instance may also predate protected pushes.',
        '',
      ])
      expect(error?.message).to.equal('Re-run without --delete, or without the --include/--exclude filter.')
    })

it('refuses --force the same way when --include is the filter', async () => {
      writeXs(tmpDir, 'table/user.xs', 'table user {\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, force: true, include: ['function/*']})

      expect(error?.message).to.contain('1 filtered-out document(s) have no guid yet')
      expect(calls).to.deep.equal([])
    })

    it('does not count a filtered-out policy as unprotectable under --force, and still checks the preview', async () => {
      writeXs(tmpDir, 'table/book.xs', 'table book {\n  guid = "GUID_BOOK"\n}')
      writeXs(tmpDir, 'policy/tmp_001.xs', 'policy tmp_001 {\n  guid = "GUID_POLICY"\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, force: true, include: ['function/*']})

      expect(error).to.equal(undefined)
      expect(previews(calls)).to.have.lengthOf(1)
      expect(pushes(calls)).to.have.lengthOf(1)
    })

    it('refuses under --force when the preview deletes a filtered-out policy after all', async () => {
      writeXs(tmpDir, 'policy/tmp_001.xs', 'policy tmp_001 {\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {
        delete: true,
        force: true,
        include: ['function/*'],
        operations: [{action: 'delete', details: '', name: 'tmp_001', type: 'policy'}],
      })

      expect(error?.message).to.equal('Re-run without --delete, or without the --include/--exclude filter.')
      expect(pushes(calls)).to.deep.equal([])
    })

    it('keeps --dry-run --force on the preview path: no up-front refusal', async () => {
      writeXs(tmpDir, 'table/user.xs', 'table user {\n}')

      const {calls, error} = await runFilteredPush(tmpDir, {delete: true, dryRun: true, exclude: ['table/*'], force: true})

      expect(error).to.equal(undefined)
      expect(previews(calls)).to.have.lengthOf(1)
      expect(pushes(calls)).to.deep.equal([])
    })
  })
})

const FINGERPRINT: SyncTargetIdentity = {
  branch: 'v1',
  branch_created_at: '2025-11-29 15:54:06+0000',
  instance_host: 'example.test',
  workspace_created_at: '2025-11-29 15:54:06+0000',
  workspace_id: '1',
}

function writeXs(dir: string, rel: string, contents: string): string {
  const full = join(dir, rel)
  fs.mkdirSync(dirname(full), {recursive: true})
  fs.writeFileSync(full, contents, 'utf8')
  return full
}

function seedRecord(dir: string, files: Record<string, string>): void {
  saveSyncState(
    dir,
    FINGERPRINT,
    Object.fromEntries(Object.entries(files).map(([relPath, sha256]) => [relPath, {key: `function:${relPath}`, sha256}])),
  )
}

function sandboxFingerprint(): SyncTargetIdentity {
  return sandboxTargetIdentity('example.test', {created_at: '2026-08-14T15:39:22.000000Z', id: 3})
}

function seedSandboxRecord(
  dir: string,
  markerDir: string,
  files: Record<string, string>,
  token?: string,
): string {
  const identity = sandboxFingerprint()
  const markerToken = writeMarkerToken(markerDir, identity.instance_host, identity.branch_created_at)
  const sandboxToken = token ?? markerToken
  saveSyncState(
    dir,
    identity,
    Object.fromEntries(Object.entries(files).map(([relPath, sha256]) => [relPath, {key: `function:${relPath}`, sha256}])),
    {sandboxToken},
  )
  return sandboxToken
}

function seedWithGone(dir: string): void {
  writeXs(dir, 'function/foo.xs', 'function foo {\n}')
  seedRecord(dir, {
    'function/foo.xs': hashFile(join(dir, 'function/foo.xs')),
    'function/gone.xs': hashBytes('gone'),
  })
}

function loadedFiles(dir: string): Record<string, {sha256: string}> {
  const raw = JSON.parse(fs.readFileSync(join(dir, '.xano', 'sync_state.json'), 'utf8')) as {
    targets: Array<{files: Record<string, {sha256: string}>}>
  }
  return raw.targets[0].files
}

function stubCommand(): {command: Command; logs: string[]; warns: string[]} {
  const logs: string[] = []
  const warns: string[] = []
  return {
    command: {
      error(message: string): never {
        const error = new Error(message)
        ;(error as Error & {oclif: {exit: number}}).oclif = {exit: 2}
        throw error
      },
      log(msg?: string) {
        logs.push(String(msg ?? ''))
      },
      warn(msg: string) {
        warns.push(msg)
      },
    } as unknown as Command,
    logs,
    warns,
  }
}

function workspaceTarget(): PushTarget {
  return {
    buildDryRunUrl: (params) => `https://example.test/api:meta/workspace/1/multidoc/dry-run?${params.toString()}`,
    buildPushUrl: (params) => `https://example.test/api:meta/workspace/1/multidoc?${params.toString()}`,
    cliVersion: '0.0.0',
    instanceOrigin: 'https://example.test',
    label: 'workspace 1',
    supportsBranches: true,
    supportsPartial: true,
  }
}

function sandboxTarget(): PushTarget {
  return {
    ...workspaceTarget(),
    buildDryRunUrl: (params) => `https://example.test/api:meta/sandbox/multidoc/dry-run?${params.toString()}`,
    buildPushUrl: (params) => `https://example.test/api:meta/sandbox/multidoc?${params.toString()}`,
    label: 'sandbox environment',
    supportsBranches: false,
  }
}

function jsonResponse(status: number, body: string): WritebackHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return body
    },
  }
}

function mockFetch(status: number, body: string) {
  return async () => jsonResponse(status, body)
}

async function runPush(
  inputDir: string,
  options: {
    branch?: string
    delete?: boolean
    dryRun?: boolean
    env?: boolean
    exclude?: string[]
    exportBody?: string
    exportStatus?: number
    exportTextThrows?: boolean
    fast?: boolean
    force?: boolean
    guid?: string
    guids?: boolean
    include?: string[]
    kind?: 'sandbox' | 'workspace'
    live?: string
    markerDir?: string
    onPost?: () => void
    perObject?: 'ok' | 'throw'
    postStatus?: number
    records?: boolean
    refresh?: boolean
    sync?: boolean
    unchanged?: boolean
    writeback?: boolean
  } = {},
): Promise<{bodies: {export?: string}; calls: Array<{body?: string; method: string; url: string}>; logs: string[]; warns: string[]}> {
  const {command, logs, warns} = stubCommand()
  const calls: Array<{body?: string; method: string; url: string}> = []
  const bodies: {export?: string} = {}
  const live = options.live ?? options.branch ?? 'v1'
  const branchCreated = FINGERPRINT.branch_created_at
  const isSandbox = options.kind === 'sandbox'
  const flags: PushFlags = {
    delete: Boolean(options.delete),
    'dry-run': Boolean(options.dryRun),
    env: Boolean(options.env),
    exclude: options.exclude,
    fast: options.fast,
    force: options.force ?? false,
    guids: options.guids ?? true,
    include: options.include,
    records: Boolean(options.records),
    refresh: options.refresh,
    sync: Boolean(options.sync),
    transaction: true,
    truncate: false,
    verbose: false,
    writeback: options.writeback,
  }

  await executePush(
    {
      accessToken: 'token',
      branch: options.branch ?? '',
      command,
      inputDir,
      syncTarget: isSandbox
        ? {instanceOrigin: 'https://example.test', kind: 'sandbox', markerDir: options.markerDir ?? inputDir}
        : {instanceOrigin: 'https://example.test', kind: 'workspace', workspace: '1'},
      async verboseFetch(url, init) {
        const method = String(init.method ?? 'GET').toUpperCase()
        const body = typeof init.body === 'string' ? init.body : undefined
        calls.push({body, method, url})
        const path = new URL(url).pathname

        if (path.endsWith('/sandbox/me') && method === 'GET') {
          return jsonApi({created_at: '2026-08-14T15:39:22.000000Z', id: 3})
        }

        if (path.endsWith('/workspace/1') && method === 'GET') {
          return jsonApi({created_at: FINGERPRINT.workspace_created_at, id: 1})
        }

        if (path.endsWith('/workspace/1/branch')) {
          const labels = new Set([live, options.branch ?? 'v1', 'v1', 'v2'])
          return jsonApi(
            [...labels].filter(Boolean).map((label) => ({
              backup: false,
              created_at: branchCreated,
              label,
              live: label === live,
            })),
          )
        }

        if (path.includes('/multidoc/dry-run')) {
          const docs = (body ?? '').split('\n---\n').filter((doc) => doc.trim())
          const action = options.unchanged ? 'unchanged' : 'update'
          const operations = docs.map((doc) => {
            const parsed = parseDocument(doc)
            return {
              action,
              details: '',
              name: parsed?.verb ? `${parsed.name} ${parsed.verb}` : parsed?.name ?? 'unknown',
              type: parsed?.type ?? 'function',
            }
          })
          return jsonApi({
            operations,
            summary: {
              function: {
                created: 0,
                deleted: 0,
                truncated: 0,
                unchanged: options.unchanged ? operations.length : 0,
                updated: options.unchanged ? 0 : operations.length,
              },
            },
          })
        }

        const objectMatch = /\/workspace\/1\/function(?:\/(\d+))?$/.exec(path)
        if (options.perObject && objectMatch && method === 'GET') {
          if (options.perObject === 'throw') throw new Error('socket hang up')
          if (!objectMatch[1]) {
            return jsonApi({items: [{id: 7, name: new URL(url).searchParams.get('search')}]})
          }

          return jsonApi({branch: 'v1', xanoscript: {status: 'ok', value: 'function foo {\n  // formatted\n}'}})
        }

        if (path.includes('/multidoc') && method === 'GET') {
          bodies.export = options.exportBody
          const status = options.exportStatus ?? 200
          if (options.exportTextThrows) {
            return {
              async json() {
                throw new Error('connection reset')
              },
              ok: true,
              status: 200,
              async text() {
                throw new Error('connection reset')
              },
            } as unknown as Response
          }

          return jsonApi(options.exportBody ?? '', status, false)
        }

        if (path.includes('/multidoc') && method === 'POST') {
          options.onPost?.()
          const status = options.postStatus ?? 200
          if (status >= 400) {
            return jsonApi({message: `Push failed (${status})`}, status)
          }

          const docs = (body ?? '').split('\n---\n').filter((doc) => doc.trim())
          const guid_map = options.guid
            ? docs.map((doc) => {
                const parsed = parseDocument(doc)
                return {
                  guid: options.guid,
                  name: parsed?.name,
                  type: parsed?.type,
                }
              })
            : []
          return jsonApi({guid_map})
        }

        return jsonApi({})
      },
    },
    isSandbox ? sandboxTarget() : workspaceTarget(),
    flags,
  )

  return {bodies, calls, logs, warns}
}

function jsonApi(body: unknown, status = 200, stringifyObject = true): Response {
  const text = typeof body === 'string' ? body : stringifyObject ? JSON.stringify(body) : String(body)
  return {
    async json() {
      return typeof body === 'string' && stringifyObject === false ? body : typeof body === 'string' ? JSON.parse(body || '{}') : body
    },
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return text
    },
  } as Response
}

interface FilteredCall {
  method: string
  url: string
}

/** The delete-capable writes: every POST that is not the preview. */
function pushes(calls: FilteredCall[]): FilteredCall[] {
  return calls.filter((call) => call.method === 'POST' && !call.url.includes('/dry-run'))
}

function previews(calls: FilteredCall[]): FilteredCall[] {
  return calls.filter((call) => call.url.includes('/dry-run'))
}

/**
 * A push with no sync record, so the only requests are the preview and the
 * push itself. `operations` is what the preview returns (default: the payload,
 * unchanged); every request is recorded, and the error the push stopped with
 * is returned rather than thrown.
 */
async function runFilteredPush(
  inputDir: string,
  options: {
    delete: boolean
    dryRun?: boolean
    dryRunBody?: string
    dryRunStatus?: number
    dryRunThrows?: boolean
    exclude?: string[]
    force?: boolean
    include?: string[]
    operations?: Array<{action: string; details: string; name: string; type: string}>
  },
): Promise<{calls: FilteredCall[]; error?: Error; logs: string[]}> {
  const {command, logs} = stubCommand()
  const calls: FilteredCall[] = []
  const flags: PushFlags = {
    delete: options.delete,
    'dry-run': Boolean(options.dryRun),
    env: false,
    exclude: options.exclude,
    force: Boolean(options.force),
    guids: false,
    include: options.include,
    records: false,
    sync: true,
    transaction: true,
    truncate: false,
    verbose: false,
  }

  let error: Error | undefined
  try {
    await executePush(
      {
        accessToken: 'token',
        branch: '',
        command,
        inputDir,
        log: (message) => logs.push(stripVTControlCharacters(message)),
        async verboseFetch(url, init) {
          const method = String(init.method ?? 'GET').toUpperCase()
          calls.push({method, url})

          if (url.includes('/multidoc/dry-run')) {
            if (options.dryRunThrows) throw new Error('socket hang up')
            if (options.dryRunBody !== undefined) return jsonApi(options.dryRunBody, options.dryRunStatus ?? 200, false)
            const docs = String(init.body ?? '').split('\n---\n').filter((doc) => doc.trim())
            const operations =
              options.operations ??
              docs.map((doc) => ({action: 'unchanged', details: '', name: parseDocument(doc)?.name ?? 'unknown', type: parseDocument(doc)?.type ?? 'function'}))
            return jsonApi({
              operations,
              summary: {function: {created: 0, deleted: 0, truncated: 0, unchanged: 0, updated: operations.length}},
            })
          }

          return jsonApi({guid_map: []})
        },
      },
      workspaceTarget(),
      flags,
    )
  } catch (error_) {
    error = error_ as Error
  }

  return {calls, error, logs}
}
