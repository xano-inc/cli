import {expect} from 'chai'
import * as fs from 'node:fs'
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {applyFilters, filterChangedEntries, findMultiDocEntries, normalizeFilterPattern} from '../../src/utils/multidoc-push.js'

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
})
