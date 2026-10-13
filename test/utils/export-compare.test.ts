import {expect} from 'chai'

import {buildDocumentKey, parseDocument} from '../../src/utils/document-parser.js'
import {
  compareLocalToExport,
  parseExportDocuments,
  preserveLocalTableRecords,
  selectWritebacks,
} from '../../src/utils/export-compare.js'

function keyFor(content: string): string {
  const parsed = parseDocument(content)
  if (!parsed) throw new Error('failed to parse test document')
  return buildDocumentKey(parsed.type, parsed.name, parsed.verb, parsed.apiGroup)
}

describe('export-compare', () => {
  describe('parseExportDocuments', () => {
    it('splits a multidoc export into parsed documents', () => {
      const docs = parseExportDocuments(['function foo {\n  guid = "abc"\n}', 'table bar {\n  guid = "def"\n}'].join('\n---\n'))
      expect(docs).to.have.lengthOf(2)
      expect(docs[0].name).to.equal('foo')
      expect(docs[1].name).to.equal('bar')
    })

    it('skips empty and unparseable segments', () => {
      const docs = parseExportDocuments('\n---\n{ not a document }\n---\nfunction foo {\n}\n')
      expect(docs).to.have.lengthOf(1)
      expect(docs[0].name).to.equal('foo')
    })
  })

  describe('preserveLocalTableRecords', () => {
    const local = 'table lock {\n  items = [\n    {id: 1}\n  ]\n  guid = "old"\n}'
    const server = 'table lock {\n  guid = "new"\n}'

    it('reinserts a local items block when the server export omitted records', () => {
      const merged = preserveLocalTableRecords(local, server)
      expect(merged).to.include('{id: 1}')
      expect(merged).to.include('guid = "new"')
    })

    it('keeps server items when the export already includes records', () => {
      const serverWithItems = 'table lock {\n  items = [\n    {id: 99}\n  ]\n  guid = "new"\n}'
      expect(preserveLocalTableRecords(local, serverWithItems)).to.equal(serverWithItems)
    })

    it('does not treat a nested array as the end of the items block', () => {
      const nestedLocal = [
        'table lock {',
        '  items = [',
        '    {',
        '      tags: [',
        '        "a"',
        '      ]',
        '    }',
        '  ]',
        '  guid = "old"',
        '}',
      ].join('\n')
      const merged = preserveLocalTableRecords(nestedLocal, server)
      expect(merged).to.include('tags: [')
      expect(merged).to.include('"a"')
      expect(merged).to.include('      ]\n    }\n  ]')
      expect(merged).to.include('guid = "new"')
    })
  })

  describe('selectWritebacks', () => {
    it('matches by key then GUID and ignores trailing whitespace', () => {
      const local = 'function foo {\n  guid = "abc"\n}\n'
      const server = 'function foo {\n  guid = "abc"\n}'
      const exported = parseExportDocuments(server)
      const pushedFiles = new Map([[keyFor(local), 'function/foo.xs']])
      const localContents = new Map([['function/foo.xs', local]])
      expect(selectWritebacks(exported, pushedFiles, localContents, {includeRecords: false})).to.have.lengthOf(0)
    })

    it('matches a pushed file by guid when the export uses a different name', () => {
      const local = 'function local_name {\n  guid = "abc"\n  var $x = 1\n}'
      const server = 'function Server_Name {\n  guid = "abc"\n  var $x = 1\n}'
      const result = selectWritebacks(
        parseExportDocuments(server),
        new Map([[keyFor(local), 'function/local_name.xs']]),
        new Map([['function/local_name.xs', local]]),
        {includeRecords: false},
      )
      expect(result).to.have.lengthOf(1)
      expect(result[0].filePath).to.equal('function/local_name.xs')
    })
  })

  describe('compareLocalToExport', () => {
    it('classifies identical, differing, new local, and server-only documents', () => {
      const localSame = 'function same {\n  guid = "aaa"\n}'
      const localDiff = 'function diff {\n  var $x = 1\n  guid = "bbb"\n}'
      const localNew = 'function brand_new {\n}'
      const serverSame = 'function same {\n  guid = "aaa"\n}'
      const serverDiff = 'function diff {\n  var $x = 2\n  guid = "bbb"\n}'
      const serverOnly = 'function remote_only {\n  guid = "ccc"\n}'

      const result = compareLocalToExport(
        [
          {content: localSame, filePath: '/tmp/same.xs', relPath: 'function/same.xs'},
          {content: localDiff, filePath: '/tmp/diff.xs', relPath: 'function/diff.xs'},
          {content: localNew, filePath: '/tmp/new.xs', relPath: 'function/brand_new.xs'},
        ],
        parseExportDocuments([serverSame, serverDiff, serverOnly].join('\n---\n')),
      )

      expect(result.identical.map((e) => e.relPath)).to.deep.equal(['function/same.xs'])
      expect(result.candidates.map((e) => e.relPath)).to.deep.equal(['function/diff.xs', 'function/brand_new.xs'])
      expect(result.unmatchedLocal.map((e) => e.relPath)).to.deep.equal(['function/brand_new.xs'])
      expect(result.serverOnly.map((d) => d.name)).to.deep.equal(['remote_only'])
    })

    it('treats trimmed-equal documents as identical', () => {
      const local = 'function foo {\n  guid = "abc"\n}\n\n'
      const server = 'function foo {\n  guid = "abc"\n}'
      const result = compareLocalToExport(
        [{content: local, filePath: '/tmp/foo.xs', relPath: 'function/foo.xs'}],
        parseExportDocuments(server),
      )
      expect(result.identical).to.have.lengthOf(1)
      expect(result.candidates).to.have.lengthOf(0)
    })
  })
})
