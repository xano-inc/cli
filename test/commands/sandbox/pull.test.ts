import {expect} from 'chai'
import * as fs from 'node:fs'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import SandboxPull, {shouldWriteSyncState} from '../../../src/commands/sandbox/pull/index.js'

describe('sandbox pull --sync-state', () => {
  it('does not write .xano/sync_state.json unless --sync-state is passed', () => {
    expect(SandboxPull.flags['sync-state'].default).to.equal(false)
  })

  describe('shouldWriteSyncState', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'xano-sandbox-pull-sync-'))
    })

    afterEach(() => {
      fs.rmSync(dir, {force: true, recursive: true})
    })

    it('is false when the flag is off and the file is missing', () => {
      expect(shouldWriteSyncState(false, dir)).to.equal(false)
    })

    it('is true when the flag is on and the file is missing', () => {
      expect(shouldWriteSyncState(true, dir)).to.equal(true)
    })

    it('is true when the flag is off and the file exists', () => {
      fs.mkdirSync(join(dir, '.xano'))
      fs.writeFileSync(join(dir, '.xano', 'sync_state.json'), '{}')
      expect(shouldWriteSyncState(false, dir)).to.equal(true)
    })

    it('is true when the flag is on and the file exists', () => {
      fs.mkdirSync(join(dir, '.xano'))
      fs.writeFileSync(join(dir, '.xano', 'sync_state.json'), '{}')
      expect(shouldWriteSyncState(true, dir)).to.equal(true)
    })
  })
})
