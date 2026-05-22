/* eslint-disable camelcase */
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import {join} from 'node:path'

import {
  applyLocalOverrides,
  findLocalProfilePath,
  LOCAL_PROFILE_FILENAME,
  parseLocalProfile,
} from '../../src/utils/local-config.js'

describe('local-config', () => {
  describe('parseLocalProfile', () => {
    it('parses a profile name and recognized override fields', () => {
      const raw = [
        'profile: brice-dev',
        'workspace: 110',
        'instance_origin: https://x62j.dev.xano.io',
        'account_origin: https://app.dev.xano.com',
        'branch: dev-feature',
      ].join('\n')
      expect(parseLocalProfile(raw)).to.deep.equal({
        account_origin: 'https://app.dev.xano.com',
        branch: 'dev-feature',
        instance_origin: 'https://x62j.dev.xano.io',
        profile: 'brice-dev',
        workspace: '110',
      })
    })

    it('coerces a numeric workspace to a string', () => {
      const result = parseLocalProfile('workspace: 110')
      expect(result).to.deep.equal({workspace: '110'})
    })

    it('throws when access_token is present', () => {
      expect(() => parseLocalProfile('access_token: secret123')).to.throw(/access_token/)
    })

    it('returns null for a file with no recognized keys', () => {
      expect(parseLocalProfile('something_else: true')).to.equal(null)
    })

    it('returns null for non-object yaml', () => {
      expect(parseLocalProfile('just a string')).to.equal(null)
    })

    it('ignores unknown keys but keeps recognized ones', () => {
      expect(parseLocalProfile('profile: dev\nunknown: x')).to.deep.equal({profile: 'dev'})
    })

    it('propagates a YAMLException thrown by js-yaml on malformed input', () => {
      // js-yaml throws a YAMLException for invalid YAML — parseLocalProfile does not
      // swallow it, so callers can surface the parse error to the user.
      expect(() => parseLocalProfile('key: [unclosed')).to.throw(/unexpected end/)
    })
  })

  describe('applyLocalOverrides', () => {
    const base = {
      access_token: 'tok',
      account_origin: 'https://app.xano.com',
      instance_origin: 'https://base.xano.io',
      workspace: '118',
    }

    it('overrides only the fields present in the local config', () => {
      const result = applyLocalOverrides(base, {workspace: '110'})
      expect(result).to.deep.equal({
        access_token: 'tok',
        account_origin: 'https://app.xano.com',
        instance_origin: 'https://base.xano.io',
        workspace: '110',
      })
    })

    it('never copies the profile name or access_token into the result', () => {
      const result = applyLocalOverrides(base, {profile: 'other', workspace: '110'})
      expect(result.access_token).to.equal('tok')
      expect((result as unknown as Record<string, unknown>).profile).to.equal(undefined)
    })

    it('returns an equivalent profile when no overrides are set', () => {
      expect(applyLocalOverrides(base, {profile: 'dev'})).to.deep.equal(base)
    })

    it('does not mutate the base profile', () => {
      applyLocalOverrides(base, {workspace: '999'})
      expect(base.workspace).to.equal('118')
    })
  })

  describe('findLocalProfilePath', () => {
    let tmp: string

    beforeEach(() => {
      tmp = fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(), 'xano-localcfg-')))
    })

    afterEach(() => {
      fs.rmSync(tmp, {force: true, recursive: true})
    })

    it('finds profile.yaml in the start directory', () => {
      const file = join(tmp, LOCAL_PROFILE_FILENAME)
      fs.writeFileSync(file, 'profile: dev')
      expect(findLocalProfilePath(tmp)).to.equal(file)
    })

    it('walks up to find profile.yaml in a parent directory', () => {
      const file = join(tmp, LOCAL_PROFILE_FILENAME)
      fs.writeFileSync(file, 'profile: dev')
      const nested = join(tmp, 'a', 'b')
      fs.mkdirSync(nested, {recursive: true})
      expect(findLocalProfilePath(nested)).to.equal(file)
    })

    it('returns null when no profile.yaml exists up the tree', () => {
      const nested = join(tmp, 'a', 'b')
      fs.mkdirSync(nested, {recursive: true})
      expect(findLocalProfilePath(nested)).to.equal(null)
    })

    it('returns the nearest profile.yaml when several exist', () => {
      fs.writeFileSync(join(tmp, LOCAL_PROFILE_FILENAME), 'profile: root')
      const nested = join(tmp, 'child')
      fs.mkdirSync(nested)
      const near = join(nested, LOCAL_PROFILE_FILENAME)
      fs.writeFileSync(near, 'profile: child')
      expect(findLocalProfilePath(nested)).to.equal(near)
    })
  })
})
