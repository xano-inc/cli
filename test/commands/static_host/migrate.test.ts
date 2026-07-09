import {expect} from 'chai'

import {envNeedsMigration, isV1, type StaticHost} from '../../../src/commands/static_host/migrate/index.js'

describe('static_host migrate v1 detection', () => {
  describe('envNeedsMigration', () => {
    it('is true for a deployed env still on v1', () => {
      expect(envNeedsMigration({canonical: 'abc', mode: 'v1'})).to.equal(true)
    })

    it('is true for a deployed env with no mode set (legacy v1)', () => {
      expect(envNeedsMigration({canonical: 'abc'})).to.equal(true)
      expect(envNeedsMigration({canonical: 'abc', mode: null})).to.equal(true)
    })

    it('is false for an env already on v2', () => {
      expect(envNeedsMigration({canonical: 'abc', mode: 'v2'})).to.equal(false)
    })

    it('is false for an undeployed env (no canonical)', () => {
      expect(envNeedsMigration()).to.equal(false)
      expect(envNeedsMigration({})).to.equal(false)
      expect(envNeedsMigration({mode: 'v1'})).to.equal(false)
    })
  })

  describe('isV1', () => {
    const host: StaticHost = {
      dev: {canonical: 'd1', mode: 'v1'},
      id: 1,
      name: 'newsite',
      prod: {canonical: 'p1', mode: 'v2'},
    }

    it('without --env, true if EITHER env is v1', () => {
      expect(isV1(host)).to.equal(true) // dev is v1
    })

    it('with --env dev, considers only dev', () => {
      expect(isV1(host, 'dev')).to.equal(true)
    })

    it('with --env prod, considers only prod', () => {
      expect(isV1(host, 'prod')).to.equal(false) // prod is v2
    })

    it('is false when both envs are v2', () => {
      const v2Host: StaticHost = {
        dev: {canonical: 'd1', mode: 'v2'},
        id: 2,
        name: 'done',
        prod: {canonical: 'p1', mode: 'v2'},
      }
      expect(isV1(v2Host)).to.equal(false)
    })

    it('is false for a host with no deployed envs', () => {
      expect(isV1({id: 3, name: 'empty'})).to.equal(false)
    })
  })
})
