import {expect} from 'chai'

import {argvHasProfileFlag, isInvalidDispatcherError} from '../../src/base-command.js'

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

  describe('isInvalidDispatcherError', () => {
    it('detects UND_ERR_INVALID_ARG on error.cause.code (Node 26 shape)', () => {
      // How Node 26 surfaces a rejected foreign dispatcher: a generic "fetch failed"
      // Error whose cause carries the real code.
      const err = Object.assign(new Error('fetch failed'), {cause: {code: 'UND_ERR_INVALID_ARG'}})
      expect(isInvalidDispatcherError(err)).to.equal(true)
    })

    it('detects UND_ERR_INVALID_ARG on the top-level error code', () => {
      const err = Object.assign(new Error('boom'), {code: 'UND_ERR_INVALID_ARG'})
      expect(isInvalidDispatcherError(err)).to.equal(true)
    })

    it('is false for an unrelated network failure', () => {
      const err = Object.assign(new Error('fetch failed'), {cause: {code: 'ECONNREFUSED'}})
      expect(isInvalidDispatcherError(err)).to.equal(false)
    })

    it('is false for a plain Error with no cause/code', () => {
      expect(isInvalidDispatcherError(new Error('fetch failed'))).to.equal(false)
    })

    it('is false for a non-Error value', () => {
      expect(isInvalidDispatcherError('fetch failed')).to.equal(false)
    })
  })
})
