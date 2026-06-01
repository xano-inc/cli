import {expect} from 'chai'

import {
  type BuildSummary,
  extractEnvCanonical,
  findBuildByCanonical,
  type StaticHostSummary,
} from '../../../../src/commands/static_host/build/pull/index.js'

const hosts: StaticHostSummary[] = [
  {
    dev: {canonical: 'dev-canon-1'},
    name: 'default',
    prod: {canonical: 'prod-canon-9'},
  },
  {
    dev: {canonical: null},
    name: 'staging',
    prod: {},
  },
]

const builds: BuildSummary[] = [
  {canonical: 'prod-canon-9', id: 9},
  {canonical: 'dev-canon-1', id: 1},
  {canonical: 'orphan-canon', id: 5},
]

describe('static_host build pull env resolution', () => {
  describe('extractEnvCanonical', () => {
    it('returns the deployed canonical for an env', () => {
      expect(extractEnvCanonical(hosts, 'default', 'dev')).to.equal('dev-canon-1')
      expect(extractEnvCanonical(hosts, 'default', 'prod')).to.equal('prod-canon-9')
    })

    it('returns null when the host is not found', () => {
      expect(extractEnvCanonical(hosts, 'missing', 'dev')).to.equal(null)
    })

    it('returns null when the env has no deployed build (null canonical)', () => {
      expect(extractEnvCanonical(hosts, 'staging', 'dev')).to.equal(null)
    })

    it('returns null when the env is absent or has no canonical', () => {
      expect(extractEnvCanonical(hosts, 'staging', 'prod')).to.equal(null)
    })
  })

  describe('findBuildByCanonical', () => {
    it('finds the build matching a deployed canonical', () => {
      expect(findBuildByCanonical(builds, 'dev-canon-1')).to.deep.equal({canonical: 'dev-canon-1', id: 1})
      expect(findBuildByCanonical(builds, 'prod-canon-9')).to.deep.equal({canonical: 'prod-canon-9', id: 9})
    })

    it('returns null when no build matches', () => {
      expect(findBuildByCanonical(builds, 'nope')).to.equal(null)
    })

    it('returns null for an empty build list', () => {
      expect(findBuildByCanonical([], 'dev-canon-1')).to.equal(null)
    })
  })
})
