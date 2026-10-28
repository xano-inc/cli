import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import {join} from 'node:path'

import {flattenBundleFile} from '../../src/utils/flatten.js'

const BUNDLE = [
  'workspace microservice {\n}',
  'table documents {\n  guid = "AAA"\n}',
  'api_group pdf {\n  canonical = "pdf"\n}',
  'query documents verb=GET {\n  api_group = "pdf"\n}',
  'microservice pdf2text {\n}',
].join('\n---\n')

describe('flattenBundleFile', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(join(os.tmpdir(), 'flatten-'))
  })

  afterEach(() => {
    fs.rmSync(root, {force: true, recursive: true})
  })

  function writeBundle(name = 'multidoc.xs', content = BUNDLE): string {
    const p = join(root, name)
    fs.writeFileSync(p, content, 'utf8')
    return p
  }

  it('splits a bundle into the pull layout and deletes the source by default', () => {
    const bundle = writeBundle()
    const result = flattenBundleFile(bundle)

    expect(result.skipped).to.be.undefined
    expect(result.written).to.have.lengthOf(5)
    expect(result.removedSource).to.equal(true)
    expect(fs.existsSync(bundle)).to.equal(false)

    // Landed in the right places (relative to the bundle's own dir).
    expect(fs.existsSync(join(root, 'workspace', 'microservice.xs'))).to.equal(true)
    expect(fs.existsSync(join(root, 'table', 'documents.xs'))).to.equal(true)
    expect(fs.existsSync(join(root, 'api', 'pdf', 'pdf.xs'))).to.equal(true)
    expect(fs.existsSync(join(root, 'api', 'pdf', 'documents_GET.xs'))).to.equal(true)
    expect(fs.existsSync(join(root, 'microservice', 'pdf_2_text.xs'))).to.equal(true)

    // Content (incl. GUID) preserved, trailing newline ensured.
    expect(fs.readFileSync(join(root, 'table', 'documents.xs'), 'utf8')).to.equal('table documents {\n  guid = "AAA"\n}\n')
  })

  it('keeps the source when keepSource is set', () => {
    const bundle = writeBundle()
    const result = flattenBundleFile(bundle, {keepSource: true})
    expect(result.removedSource).to.equal(false)
    expect(fs.existsSync(bundle)).to.equal(true)
  })

  it('writes nothing and deletes nothing in dryRun', () => {
    const bundle = writeBundle()
    const result = flattenBundleFile(bundle, {dryRun: true})
    expect(result.written).to.have.lengthOf(5)
    expect(result.removedSource).to.equal(false)
    expect(fs.existsSync(bundle)).to.equal(true)
    expect(fs.existsSync(join(root, 'table', 'documents.xs'))).to.equal(false)
  })

  it('skips a single-document file', () => {
    const bundle = writeBundle('single.xs', 'table only {\n}')
    const result = flattenBundleFile(bundle)
    expect(result.skipped).to.equal('single')
    expect(result.written).to.have.lengthOf(0)
    expect(fs.existsSync(bundle)).to.equal(true) // not deleted
  })

  it('splits a CRLF bundle instead of skipping it as one document', () => {
    const bundle = writeBundle('crlf.xs', 'table a {\r\n}\r\n---\r\ntable b {\r\n}\r\n')
    const result = flattenBundleFile(bundle)
    expect(result.skipped).to.be.undefined
    expect(fs.readFileSync(join(root, 'table', 'a.xs'), 'utf8')).to.equal('table a {\n}\n')
    expect(fs.readFileSync(join(root, 'table', 'b.xs'), 'utf8')).to.equal('table b {\n}\n')
  })

  it('refuses and keeps the source when a split leaves a document that does not parse', () => {
    // The `--- ` line inside the prompt splits like a separator, leaving a `"""` tail.
    const content = 'table a {\n}\n---\nagent b {\n  prompt = """\n    step one\n--- \n    """\n}\n'
    const bundle = writeBundle('cut.xs', content)

    expect(() => flattenBundleFile(bundle)).to.throw(/1 document\(s\) do not parse[\s\S]*"""/)
    expect(fs.readFileSync(bundle, 'utf8')).to.equal(content)
    expect(fs.readdirSync(root)).to.deep.equal(['cut.xs']) // nothing written
  })

  it('still splits a bundle whose extra fragment holds only comments', () => {
    const bundle = writeBundle('notes.xs', 'table a {\n}\n---\n// moved to b\n---\ntable b {\n}\n')
    const result = flattenBundleFile(bundle)
    expect(result.written).to.have.lengthOf(2)
    expect(result.removedSource).to.equal(true)
  })

  it('throws on a destination collision unless force is set', () => {
    const bundle = writeBundle()
    // Pre-create one of the destinations to force a clash.
    fs.mkdirSync(join(root, 'table'), {recursive: true})
    fs.writeFileSync(join(root, 'table', 'documents.xs'), 'table documents {\n  old = 1\n}', 'utf8')

    expect(() => flattenBundleFile(bundle)).to.throw(/already exist/)
    // Source must survive a failed flatten.
    expect(fs.existsSync(bundle)).to.equal(true)

    // With force it overwrites and succeeds.
    const result = flattenBundleFile(bundle, {force: true})
    expect(result.removedSource).to.equal(true)
    expect(fs.readFileSync(join(root, 'table', 'documents.xs'), 'utf8')).to.contain('guid = "AAA"')
  })
})
