import type {Command} from '@oclif/core'

import {expect} from 'chai'
import * as fs from 'node:fs'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {buildDocumentKey, parseDocument} from '../../src/utils/document-parser.js'
import {
  applyFilters,
  deletesHittingFilteredOut,
  describeFilteredOut,
  filterChangedEntries,
  findMultiDocEntries,
  findWorkspaceEntries,
  normalizeFilterPattern,
  parseExportDocuments,
  preserveLocalTableRecords,
  type PushTarget,
  selectWritebacks,
  writeBackFormattedDocuments,
  type WritebackHttpResponse,
} from '../../src/utils/multidoc-push.js'

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

    it('returns nothing when there is no filter at all, so an unfiltered push is never blocked', () => {
      expect(deletesHittingFilteredOut([{action: 'delete', name: 'user', type: 'table'}], [])).to.deep.equal([])
    })
  })

  describe('parseExportDocuments', () => {
    it('splits a multidoc export into parsed documents', () => {
      const multidoc = [
        'function foo {\n  guid = "abc"\n}',
        'table bar {\n  guid = "def"\n}',
      ].join('\n---\n')

      const docs = parseExportDocuments(multidoc)
      expect(docs).to.have.lengthOf(2)
      expect(docs[0].type).to.equal('function')
      expect(docs[0].name).to.equal('foo')
      expect(docs[1].type).to.equal('table')
      expect(docs[1].name).to.equal('bar')
    })

    it('skips empty and unparseable segments', () => {
      const docs = parseExportDocuments('\n---\n{ not a document }\n---\nfunction foo {\n}\n')
      expect(docs).to.have.lengthOf(1)
      expect(docs[0].name).to.equal('foo')
    })
  })

  describe('preserveLocalTableRecords', () => {
    const local = [
      'table lock {',
      '  schema {',
      '    int id',
      '  }',
      '  items = [',
      '    {id: 1}',
      '  ]',
      '  guid = "old"',
      '}',
    ].join('\n')

    const server = [
      'table lock {',
      '  schema {',
      '    int id',
      '  }',
      '  guid = "new"',
      '}',
    ].join('\n')

    it('reinserts a local items block when the server export omitted records', () => {
      const merged = preserveLocalTableRecords(local, server)
      expect(merged).to.include('items = [')
      expect(merged).to.include('{id: 1}')
      expect(merged).to.include('guid = "new"')
    })

    it('returns server content when the local file has no items', () => {
      expect(preserveLocalTableRecords(server, server)).to.equal(server)
    })

    it('keeps server items when the export already includes records', () => {
      const serverWithItems = [
        'table lock {',
        '  schema {',
        '    int id',
        '  }',
        '  items = [',
        '    {id: 99}',
        '  ]',
        '  guid = "new"',
        '}',
      ].join('\n')

      expect(preserveLocalTableRecords(local, serverWithItems)).to.equal(serverWithItems)
    })
  })

  describe('selectWritebacks', () => {
    it('writes only pushed files whose content differs from the export', () => {
      const localFn = 'function foo {\n  var $x = 1\n}'
      const serverFn = 'function foo {\n  var $x = 1\n  guid = "abc"\n}'
      const localOther = 'function bar {\n}'
      const serverOther = 'function bar {\n  guid = "def"\n}'

      const exported = parseExportDocuments([serverFn, serverOther].join('\n---\n'))
      const pushedFiles = new Map([[keyFor(localFn), 'function/foo.xs']])
      const localContents = new Map([
        ['function/bar.xs', localOther],
        ['function/foo.xs', localFn],
      ])

      const result = selectWritebacks(exported, pushedFiles, localContents, {includeRecords: false})
      expect(result).to.have.lengthOf(1)
      expect(result[0].filePath).to.equal('function/foo.xs')
      expect(result[0].content).to.equal(serverFn)
    })

    it('skips a file when local content already matches the export', () => {
      const content = 'function foo {\n  guid = "abc"\n}'
      const exported = parseExportDocuments(content)
      const pushedFiles = new Map([[keyFor(content), 'function/foo.xs']])
      const localContents = new Map([['function/foo.xs', content]])

      expect(selectWritebacks(exported, pushedFiles, localContents, {includeRecords: false})).to.have.lengthOf(0)
    })

    it('treats trailing whitespace as equal so it does not rewrite unchanged files', () => {
      const server = 'function foo {\n  guid = "abc"\n}'
      const local = `${server}\n`
      const exported = parseExportDocuments(server)
      const pushedFiles = new Map([[keyFor(local), 'function/foo.xs']])
      const localContents = new Map([['function/foo.xs', local]])

      expect(selectWritebacks(exported, pushedFiles, localContents, {includeRecords: false})).to.have.lengthOf(0)
    })

    it('preserves local table records when the export was fetched without records', () => {
      const local = 'table lock {\n  schema {\n    int id\n  }\n  items = [\n    {id: 1}\n  ]\n}'
      const server = 'table lock {\n  schema {\n    int id\n  }\n  guid = "abc"\n}'
      const exported = parseExportDocuments(server)
      const pushedFiles = new Map([[keyFor(local), 'table/lock.xs']])
      const localContents = new Map([['table/lock.xs', local]])

      const result = selectWritebacks(exported, pushedFiles, localContents, {includeRecords: false})
      expect(result).to.have.lengthOf(1)
      expect(result[0].content).to.include('items = [')
      expect(result[0].content).to.include('{id: 1}')
      expect(result[0].content).to.include('guid = "abc"')
    })

    it('does not preserve local records when the export included records', () => {
      const local = 'table lock {\n  items = [\n    {id: 1}\n  ]\n}'
      const server = 'table lock {\n  items = [\n    {id: 99}\n  ]\n  guid = "abc"\n}'
      const exported = parseExportDocuments(server)
      const pushedFiles = new Map([[keyFor(local), 'table/lock.xs']])
      const localContents = new Map([['table/lock.xs', local]])

      const result = selectWritebacks(exported, pushedFiles, localContents, {includeRecords: true})
      expect(result).to.have.lengthOf(1)
      expect(result[0].content).to.include('{id: 99}')
      expect(result[0].content).not.to.include('{id: 1}')
    })

    it('matches a pushed file when the export changes name casing', () => {
      const local = 'function "achievements/enqueue" {\n  var $x = 1\n}'
      const server = 'function "Achievements/enqueue" {\n  var $x = 1\n  guid = "abc"\n}'
      const exported = parseExportDocuments(server)
      const pushedFiles = new Map([[keyFor(local), 'function/enqueue.xs']])
      const localContents = new Map([['function/enqueue.xs', local]])

      const result = selectWritebacks(exported, pushedFiles, localContents, {includeRecords: false})
      expect(result).to.have.lengthOf(1)
      expect(result[0].filePath).to.equal('function/enqueue.xs')
    })

    it('matches a pushed file by guid when the export uses a different name', () => {
      const local = 'function local_name {\n  guid = "abc"\n  var $x = 1\n}'
      const server = 'function Server_Name {\n  guid = "abc"\n  var $x = 1\n}'
      const exported = parseExportDocuments(server)
      const pushedFiles = new Map([[keyFor(local), 'function/local_name.xs']])
      const localContents = new Map([['function/local_name.xs', local]])

      const result = selectWritebacks(exported, pushedFiles, localContents, {includeRecords: false})
      expect(result).to.have.lengthOf(1)
      expect(result[0].filePath).to.equal('function/local_name.xs')
      expect(result[0].content).to.include('function Server_Name')
    })

    it('does not guess when two pushed files differ only by name casing', () => {
      const localA = 'function "Achievements/enqueue" {\n  var $a = 1\n}'
      const localB = 'function "achievements/enqueue" {\n  var $b = 2\n}'
      const server = 'function "ACHIEVEMENTS/enqueue" {\n  var $c = 3\n}'
      const exported = parseExportDocuments(server)
      const pushedFiles = new Map([
        [keyFor(localA), 'function/enqueue_a.xs'],
        [keyFor(localB), 'function/enqueue_b.xs'],
      ])
      const localContents = new Map([
        ['function/enqueue_a.xs', localA],
        ['function/enqueue_b.xs', localB],
      ])

      expect(selectWritebacks(exported, pushedFiles, localContents, {includeRecords: false})).to.have.lengthOf(0)
    })

    it('still matches by guid when name casing is ambiguous', () => {
      const localA = 'function "Achievements/enqueue" {\n  guid = "aaa"\n  var $a = 1\n}'
      const localB = 'function "achievements/enqueue" {\n  guid = "bbb"\n  var $b = 2\n}'
      const server = 'function "ACHIEVEMENTS/enqueue" {\n  guid = "bbb"\n  var $c = 3\n}'
      const exported = parseExportDocuments(server)
      const pushedFiles = new Map([
        [keyFor(localA), 'function/enqueue_a.xs'],
        [keyFor(localB), 'function/enqueue_b.xs'],
      ])
      const localContents = new Map([
        ['function/enqueue_a.xs', localA],
        ['function/enqueue_b.xs', localB],
      ])

      const result = selectWritebacks(exported, pushedFiles, localContents, {includeRecords: false})
      expect(result).to.have.lengthOf(1)
      expect(result[0].filePath).to.equal('function/enqueue_b.xs')
      expect(result[0].content).to.include('var $c = 3')
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
      const elapsedMs = await writeBackFormattedDocuments({
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

      expect(fs.readFileSync(filePath, 'utf8')).to.equal(`${server}\n`)
      expect(logs[0]).to.match(/^Wrote 1 server-formatted file back to disk \(\d+\.\d+s\)$/)
      expect(elapsedMs).to.be.at.least(0)
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

    it('warns when the export is not XanoScript', async () => {
      const filePath = join(tmpDir, 'foo.xs')
      fs.writeFileSync(filePath, 'function foo {\n}\n', 'utf8')
      const {command, warns} = stubCommand()

      await writeBackFormattedDocuments({
        accessToken: 'token',
        branch: '',
        command,
        includeEnv: false,
        includeRecords: false,
        pushedEntries: [{content: 'function foo {\n}', filePath}],
        target: workspaceTarget(),
        verbose: false,
        verboseFetch: mockFetch(200, '{"guid_map":[]}'),
      })

      expect(warns[0]).to.include('export contained no XanoScript documents')
      expect(warns[0]).to.include('{"guid_map":[]}')
    })
  })
})

function stubCommand(): {command: Command; logs: string[]; warns: string[]} {
  const logs: string[] = []
  const warns: string[] = []
  return {
    command: {
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
    buildDryRunUrl: () => null,
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
