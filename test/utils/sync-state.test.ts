/* eslint-disable unicorn/consistent-function-scoping -- per-test fetch stubs close over case-specific data */
import {expect} from 'chai'
import * as fs from 'node:fs'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {
  computeCandidates,
  hashBytes,
  hashFile,
  loadSyncState,
  recordEntriesForPaths,
  resolveTarget,
  sandboxTargetIdentity,
  saveSyncState,
  SYNC_STATE_DIR,
  syncStateExists,
  type SyncTargetIdentity,
  toRelPath,
} from '../../src/utils/sync-state.js'

function mkDir(): string {
  return mkdtempSync(join(tmpdir(), 'xano-sync-state-'))
}

const target: SyncTargetIdentity = {
  branch: 'v1',
  branch_created_at: '2025-11-29 15:54:06+0000',
  instance_host: 'example.test',
  workspace_created_at: '2025-11-29 15:54:06+0000',
  workspace_id: '1',
}

function writeFile(dir: string, rel: string, contents: string): string {
  const full = join(dir, rel)
  fs.mkdirSync(join(full, '..'), {recursive: true})
  fs.writeFileSync(full, contents)
  return full
}

describe('sync-state', () => {
  let dir: string

  beforeEach(() => {
    dir = mkDir()
  })

  afterEach(() => {
    fs.rmSync(dir, {force: true, recursive: true})
  })

  describe('hashing', () => {
    it('hashes raw bytes as 64-character lowercase sha256', () => {
      const digest = hashBytes('hello')
      expect(digest).to.match(/^[0-9a-f]{64}$/)
      expect(digest).to.equal(hashBytes(Buffer.from('hello')))
    })

    it('hashes a file the same way as its contents', () => {
      const filePath = writeFile(dir, 'function/foo.xs', 'function foo {\n}\n')
      expect(hashFile(filePath)).to.equal(hashBytes(fs.readFileSync(filePath)))
    })
  })

  describe('syncStateExists', () => {
    it('returns false when the file is missing', () => {
      expect(syncStateExists(dir)).to.equal(false)
    })

    it('returns true when the file exists', () => {
      saveSyncState(dir, target, {
        'function/foo.xs': {key: 'function:foo', sha256: hashBytes('a')},
      })
      expect(syncStateExists(dir)).to.equal(true)
    })

    it('returns true for an invalid file', () => {
      fs.mkdirSync(join(dir, SYNC_STATE_DIR))
      fs.writeFileSync(join(dir, SYNC_STATE_DIR, 'sync_state.json'), 'nope', 'utf8')
      expect(syncStateExists(dir)).to.equal(true)
    })
  })

  describe('loadSyncState', () => {
    it('returns null when the file is missing', () => {
      expect(loadSyncState(dir, target)).to.equal(null)
    })

    it('returns null for invalid JSON and warns once', () => {
      fs.mkdirSync(join(dir, SYNC_STATE_DIR))
      fs.writeFileSync(join(dir, SYNC_STATE_DIR, 'sync_state.json'), '{not json', 'utf8')
      const warnings: string[] = []
      expect(loadSyncState(dir, target, (msg) => warnings.push(msg))).to.equal(null)
      expect(warnings).to.have.lengthOf(1)
    })

    it('returns null for an unknown version', () => {
      fs.mkdirSync(join(dir, SYNC_STATE_DIR))
      fs.writeFileSync(
        join(dir, SYNC_STATE_DIR, 'sync_state.json'),
        JSON.stringify({targets: [], version: 99}),
        'utf8',
      )
      const warnings: string[] = []
      expect(loadSyncState(dir, target, (msg) => warnings.push(msg))).to.equal(null)
      expect(warnings[0]).to.include('unknown version')
    })

    it('returns null when the target fingerprints do not match', () => {
      saveSyncState(dir, target, {
        'function/foo.xs': {key: 'function:foo', sha256: hashBytes('a')},
      })
      expect(
        loadSyncState(dir, {
          ...target,
          branch_created_at: 'other',
        }),
      ).to.equal(null)
    })

    it('returns the matching target', () => {
      const entry = {key: 'function:foo', sha256: hashBytes('a')}
      saveSyncState(dir, target, {'function/foo.xs': entry})
      const loaded = loadSyncState(dir, target)
      expect(loaded?.files['function/foo.xs']).to.deep.equal(entry)
    })
  })

  describe('host and branch matching', () => {
    it('normalizes trailing slash and host case to the same target', async () => {
      const fetchJson = async (pathname: string) => {
        if (pathname === '/workspace/1') return {created_at: target.workspace_created_at}
        if (pathname === '/workspace/1/branch') {
          return [{backup: false, created_at: target.branch_created_at, label: 'v1', live: true}]
        }

        throw new Error(pathname)
      }

      const a = await resolveTarget('https://Example.TEST/', '1', '', fetchJson)
      const b = await resolveTarget('HTTPS://example.test/api', '1', 'v1', fetchJson)
      expect(a).to.deep.equal(b)
      expect(a?.instance_host).to.equal('example.test')
      expect(a?.branch).to.equal('v1')
    })

    it('treats an empty branch and the live branch name as the same target', async () => {
      const fetchJson = async (pathname: string) => {
        if (pathname.endsWith('/workspace/1')) return {created_at: 'ws'}
        return [
          {backup: false, created_at: 'br', label: 'v1', live: true},
          {backup: false, created_at: 'br2', label: 'v2', live: false},
        ]
      }

      const live = await resolveTarget('https://example.test', '1', '', fetchJson)
      const named = await resolveTarget('https://example.test', '1', 'v1', fetchJson)
      expect(live?.branch).to.equal('v1')
      expect(named).to.deep.equal(live)
    })

    it('returns null when the branch list request fails', async () => {
      const fetchJson = async (pathname: string) => {
        if (pathname.endsWith('/branch')) throw new Error('nope')
        return {created_at: 'ws'}
      }

      expect(await resolveTarget('https://example.test', '1', 'v1', fetchJson)).to.equal(null)
    })

    it('returns null when the workspace request fails', async () => {
      const fetchJson = async (pathname: string) => {
        if (pathname.endsWith('/workspace/1')) throw new Error('nope')
        return [{backup: false, created_at: 'br', label: 'v1', live: true}]
      }

      expect(await resolveTarget('https://example.test', '1', 'v1', fetchJson)).to.equal(null)
    })

    it('returns null when workspace_created_at differs on load', () => {
      saveSyncState(dir, target, {
        'function/foo.xs': {key: 'function:foo', sha256: hashBytes('a')},
      })
      expect(loadSyncState(dir, {...target, workspace_created_at: 'recreated'})).to.equal(null)
    })
  })

  describe('computeCandidates', () => {
    it('treats a missing record as every file being a candidate', () => {
      const files = [{relPath: 'function/foo.xs', sha256: hashBytes('a')}]
      const result = computeCandidates(files, null)
      expect(result.candidates).to.deep.equal(files)
      expect(result.unchanged).to.deep.equal([])
      expect(result.deletedLocally).to.deep.equal([])
    })

    it('splits candidates, unchanged, and deleted-locally', () => {
      const state = {
        ...target,
        files: {
          'function/changed.xs': {key: 'function:changed', sha256: hashBytes('before')},
          'function/gone.xs': {key: 'function:gone', sha256: hashBytes('old')},
          'function/same.xs': {key: 'function:same', sha256: hashBytes('same')},
        },
      }
      const result = computeCandidates(
        [
          {relPath: 'function/same.xs', sha256: hashBytes('same')},
          {relPath: 'function/changed.xs', sha256: hashBytes('after')},
          {relPath: 'function/new.xs', sha256: hashBytes('new')},
        ],
        state,
      )
      expect(result.unchanged.map((f) => f.relPath)).to.deep.equal(['function/same.xs'])
      expect(result.candidates.map((f) => f.relPath)).to.deep.equal(['function/changed.xs', 'function/new.xs'])
      expect(result.deletedLocally).to.deep.equal([{key: 'function:gone', relPath: 'function/gone.xs'}])
    })
  })

  describe('saveSyncState', () => {
    it('creates .xano/ and writes only sync_state.json', () => {
      saveSyncState(dir, target, {
        'function/foo.xs': {key: 'function:foo', sha256: hashBytes('a')},
      })
      expect(fs.readdirSync(join(dir, SYNC_STATE_DIR))).to.deep.equal(['sync_state.json'])
    })

    it('re-reads and merges so a deleted file comes back holding only this run', () => {
      saveSyncState(dir, target, {
        'function/old.xs': {key: 'function:old', sha256: hashBytes('old')},
      })
      fs.rmSync(join(dir, SYNC_STATE_DIR, 'sync_state.json'))
      saveSyncState(dir, target, {
        'function/new.xs': {key: 'function:new', sha256: hashBytes('new')},
      })
      const loaded = loadSyncState(dir, target)
      expect(Object.keys(loaded?.files ?? {})).to.deep.equal(['function/new.xs'])
    })

    it('replaces a section whose branch_created_at differs instead of merging', () => {
      saveSyncState(dir, target, {
        'function/old.xs': {key: 'function:old', sha256: hashBytes('old')},
      })
      const recreated = {...target, branch_created_at: 'recreated'}
      saveSyncState(dir, recreated, {
        'function/new.xs': {key: 'function:new', sha256: hashBytes('new')},
      })
      expect(loadSyncState(dir, target)).to.equal(null)
      const loaded = loadSyncState(dir, recreated)
      expect(Object.keys(loaded?.files ?? {})).to.deep.equal(['function/new.xs'])
    })

    it('leaves no temp file behind when the rename target cannot be replaced', () => {
      const stateDir = join(dir, SYNC_STATE_DIR)
      fs.mkdirSync(stateDir)
      const dest = join(stateDir, 'sync_state.json')
      fs.mkdirSync(dest)
      expect(() =>
        saveSyncState(dir, target, {
          'function/foo.xs': {key: 'function:foo', sha256: hashBytes('a')},
        }),
      ).to.throw()
      expect(fs.readdirSync(stateDir).filter((name) => name.includes('.tmp-'))).to.deep.equal([])
    })

    it('replaces an invalid file on the next save', () => {
      fs.mkdirSync(join(dir, SYNC_STATE_DIR))
      fs.writeFileSync(join(dir, SYNC_STATE_DIR, 'sync_state.json'), 'nope', 'utf8')
      saveSyncState(dir, target, {
        'function/foo.xs': {key: 'function:foo', sha256: hashBytes('a')},
      })
      expect(loadSyncState(dir, target)?.files['function/foo.xs']?.key).to.equal('function:foo')
    })

    it('uses posix-style relative paths', () => {
      const filePath = writeFile(dir, 'function/foo.xs', 'function foo {\n}\n')
      expect(toRelPath(dir, filePath)).to.equal('function/foo.xs')
    })

    it('with pruneMissing, a merge drops missing files and keeps existing ones', () => {
      writeFile(dir, 'function/keep.xs', 'keep')
      writeFile(dir, 'function/update.xs', 'before')
      saveSyncState(dir, target, {
        'function/gone.xs': {key: 'function:gone', sha256: hashBytes('gone')},
        'function/keep.xs': {key: 'function:keep', sha256: hashBytes('keep')},
        'function/update.xs': {key: 'function:update', sha256: hashBytes('before')},
      })
      saveSyncState(
        dir,
        target,
        {
          'function/update.xs': {key: 'function:update', sha256: hashBytes('after')},
        },
        {pruneMissing: true},
      )
      const loaded = loadSyncState(dir, target)
      expect(Object.keys(loaded?.files ?? {}).sort()).to.deep.equal(['function/keep.xs', 'function/update.xs'])
      expect(loaded?.files['function/keep.xs']?.sha256).to.equal(hashBytes('keep'))
      expect(loaded?.files['function/update.xs']?.sha256).to.equal(hashBytes('after'))
    })

    it('without pruneMissing, a merge keeps the missing entry', () => {
      writeFile(dir, 'function/keep.xs', 'keep')
      saveSyncState(dir, target, {
        'function/gone.xs': {key: 'function:gone', sha256: hashBytes('gone')},
        'function/keep.xs': {key: 'function:keep', sha256: hashBytes('keep')},
      })
      saveSyncState(dir, target, {
        'function/keep.xs': {key: 'function:keep', sha256: hashBytes('keep2')},
      })
      const loaded = loadSyncState(dir, target)
      expect(Object.keys(loaded?.files ?? {}).sort()).to.deep.equal(['function/gone.xs', 'function/keep.xs'])
    })

    it('round-trips sandbox_token and preserves it on merge', () => {
      saveSyncState(
        dir,
        target,
        {'function/foo.xs': {key: 'function:foo', sha256: hashBytes('a')}},
        {sandboxToken: 'tok-1'},
      )
      expect(loadSyncState(dir, target)?.sandbox_token).to.equal('tok-1')
      saveSyncState(dir, target, {'function/bar.xs': {key: 'function:bar', sha256: hashBytes('b')}})
      const loaded = loadSyncState(dir, target)
      expect(loaded?.sandbox_token).to.equal('tok-1')
      expect(Object.keys(loaded?.files ?? {}).sort()).to.deep.equal(['function/bar.xs', 'function/foo.xs'])
    })

    it('replaces a sandbox section whose tenant id differs instead of merging', () => {
      const sandbox = sandboxTargetIdentity('example.test', {created_at: '2026-08-14T15:39:22.000000Z', id: 3})
      saveSyncState(dir, sandbox, {'function/old.xs': {key: 'function:old', sha256: hashBytes('old')}}, {
        sandboxToken: 'old-token',
      })
      const recreated = sandboxTargetIdentity('example.test', {created_at: '2026-10-01T18:47:55.000000Z', id: 4})
      saveSyncState(dir, recreated, {'function/new.xs': {key: 'function:new', sha256: hashBytes('new')}}, {
        sandboxToken: 'new-token',
      })
      expect(loadSyncState(dir, sandbox)).to.equal(null)
      const loaded = loadSyncState(dir, recreated)
      expect(Object.keys(loaded?.files ?? {})).to.deep.equal(['function/new.xs'])
      expect(loaded?.sandbox_token).to.equal('new-token')
    })
  })

  describe('sandboxTargetIdentity', () => {
    it('maps tenant id and created_at onto the fingerprint fields', () => {
      expect(sandboxTargetIdentity('example.test', {created_at: 'when', id: 3})).to.deep.equal({
        branch: 'sandbox',
        branch_created_at: '3',
        instance_host: 'example.test',
        workspace_created_at: 'when',
        workspace_id: 'sandbox',
      })
    })
  })

  describe('recordEntriesForPaths', () => {
    it('hashes parseable documents and skips empty files', () => {
      const filePath = writeFile(dir, 'function/foo.xs', 'function foo {\n}\n')
      writeFile(dir, 'function/empty.xs', '   \n')
      const entries = recordEntriesForPaths(dir, [filePath, join(dir, 'function/empty.xs'), join(dir, 'missing.xs')])
      expect(Object.keys(entries)).to.deep.equal(['function/foo.xs'])
      expect(entries['function/foo.xs'].key).to.equal('function:foo')
      expect(entries['function/foo.xs'].sha256).to.equal(hashFile(filePath))
    })
  })
})
