import {expect} from 'chai'
import * as fs from 'node:fs'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  invalidateMarkerHost,
  invalidateSandboxMarkerForOrigin,
  readMarkerToken,
  SANDBOX_MARKER_FILENAME,
  sandboxMarkerExists,
  sandboxMarkerKey,
  writeMarkerToken,
} from '../../src/utils/sandbox-marker.js'

describe('sandbox-marker', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xano-sandbox-marker-'))
  })

  afterEach(() => {
    fs.rmSync(dir, {force: true, recursive: true})
  })

  it('returns null when the file is missing', () => {
    expect(readMarkerToken(dir, 'example.test', 3)).to.equal(null)
    expect(sandboxMarkerExists(dir)).to.equal(false)
  })

  it('writes a token and reads it back', () => {
    const token = writeMarkerToken(dir, 'example.test', 3)
    expect(token).to.match(/^[0-9a-f-]{36}$/i)
    expect(readMarkerToken(dir, 'example.test', 3)).to.equal(token)
    expect(sandboxMarkerExists(dir)).to.equal(true)
    expect(fs.readdirSync(dir)).to.deep.equal([SANDBOX_MARKER_FILENAME])
  })

  it('replaces the token for the same host and tenant', () => {
    const first = writeMarkerToken(dir, 'example.test', 3)
    const second = writeMarkerToken(dir, 'example.test', 3)
    expect(second).to.not.equal(first)
    expect(readMarkerToken(dir, 'example.test', 3)).to.equal(second)
  })

  it('keeps other tenants when writing one', () => {
    const a = writeMarkerToken(dir, 'example.test', 3)
    const b = writeMarkerToken(dir, 'example.test', 4)
    expect(readMarkerToken(dir, 'example.test', 3)).to.equal(a)
    expect(readMarkerToken(dir, 'example.test', 4)).to.equal(b)
  })

  it('invalidateMarkerHost is a no-op when the file is missing', () => {
    expect(() => invalidateMarkerHost(dir, 'example.test')).to.not.throw()
    expect(sandboxMarkerExists(dir)).to.equal(false)
  })

  it('invalidateMarkerHost removes only that host\'s entries', () => {
    writeMarkerToken(dir, 'example.test', 3)
    const other = writeMarkerToken(dir, 'other.test', 3)
    invalidateMarkerHost(dir, 'example.test')
    expect(readMarkerToken(dir, 'example.test', 3)).to.equal(null)
    expect(readMarkerToken(dir, 'other.test', 3)).to.equal(other)
  })

  it('invalidateSandboxMarkerForOrigin uses the instance host', () => {
    writeMarkerToken(dir, 'example.test', 3)
    invalidateSandboxMarkerForOrigin(dir, 'https://Example.TEST/api')
    expect(readMarkerToken(dir, 'example.test', 3)).to.equal(null)
  })

  it('builds keys as host#tenantId', () => {
    expect(sandboxMarkerKey('example.test', 3)).to.equal('example.test#3')
  })

  it('leaves no temp file behind when the rename target cannot be replaced', () => {
    const dest = join(dir, SANDBOX_MARKER_FILENAME)
    fs.mkdirSync(dest)
    expect(() => writeMarkerToken(dir, 'example.test', 3)).to.throw()
    expect(fs.readdirSync(dir).filter((name) => name.includes('.tmp-'))).to.deep.equal([])
  })
})
