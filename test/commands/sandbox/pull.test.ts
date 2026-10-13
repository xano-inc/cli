import {expect} from 'chai'
import * as fs from 'node:fs'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import SandboxPull, {syncStateAction} from '../../../src/commands/sandbox/pull/index.js'

describe('sandbox pull --sync-state', () => {
  it('does not write .xano/sync_state.json unless --sync-state is passed', () => {
    expect(SandboxPull.flags['sync-state'].default).to.equal(false)
  })

  describe('syncStateAction', () => {
    let dir: string

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'xano-sandbox-pull-sync-'))
    })

    afterEach(() => {
      fs.rmSync(dir, {force: true, recursive: true})
    })

    it('skips when the flag is off and the file is missing', () => {
      expect(syncStateAction(false, dir, false)).to.equal('skip')
    })

    it('writes when the flag is on and the file is missing', () => {
      expect(syncStateAction(true, dir, false)).to.equal('write')
    })

    it('writes when the flag is off and the file exists', () => {
      fs.mkdirSync(join(dir, '.xano'))
      fs.writeFileSync(join(dir, '.xano', 'sync_state.json'), '{}')
      expect(syncStateAction(false, dir, false)).to.equal('write')
    })

    it('writes when the flag is on and the file exists', () => {
      fs.mkdirSync(join(dir, '.xano'))
      fs.writeFileSync(join(dir, '.xano', 'sync_state.json'), '{}')
      expect(syncStateAction(true, dir, false)).to.equal('write')
    })

    it('refuses to write for --draft when the flag is on', () => {
      expect(syncStateAction(true, dir, true)).to.equal('draft')
    })

    it('refuses to write for --draft when the file exists', () => {
      fs.mkdirSync(join(dir, '.xano'))
      fs.writeFileSync(join(dir, '.xano', 'sync_state.json'), '{}')
      expect(syncStateAction(false, dir, true)).to.equal('draft')
    })

    it('stays silent for --draft when there is nothing to write', () => {
      expect(syncStateAction(false, dir, true)).to.equal('skip')
    })
  })
})
