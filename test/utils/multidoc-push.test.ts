import type {Command} from '@oclif/core'

import {expect} from 'chai'
import * as fs from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {buildDocumentKey, parseDocument} from '../../src/utils/document-parser.js'
import {
  filterChangedEntries,
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
