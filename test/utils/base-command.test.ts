import {expect} from 'chai'

import {argvHasProfileFlag} from '../../src/base-command.js'

describe('argvHasProfileFlag', () => {
  it('detects -p', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'workspace', 'push', '-p', 'prod'], {})).to.equal(true)
  })

  it('detects --profile', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'push', '--profile', 'prod'], {})).to.equal(true)
  })

  it('detects --profile=value', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'push', '--profile=prod'], {})).to.equal(true)
  })

  it('detects the XANO_PROFILE env var', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'push'], {XANO_PROFILE: 'prod'})).to.equal(true)
  })

  it('returns false when neither flag nor env is present', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'push'], {})).to.equal(false)
  })

  it('ignores an empty XANO_PROFILE', () => {
    expect(argvHasProfileFlag(['node', 'xano', 'push'], {XANO_PROFILE: ''})).to.equal(false)
  })
})
