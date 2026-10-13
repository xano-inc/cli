 
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import {join} from 'node:path'

import {
  applyLocalOverrides,
  findLocalProfilePath,
  formatLocalProfileBanner,
  formatWorkspacePushDefaultsBanner,
  LOCAL_PROFILE_FILENAME,
  parseLocalProfile,
  resolveProfileSelection,
  resolvePushDefaults,
} from '../../src/utils/local-config.js'

describe('local-config', () => {
  describe('parseLocalProfile', () => {
    it('parses a profile name and recognized override fields', () => {
      const raw = [
        'profile: staging',
        'workspace: 110',
        'instance_origin: https://x62j.dev.xano.io',
        'account_origin: https://app.dev.xano.com',
        'branch: dev-feature',
      ].join('\n')
      expect(parseLocalProfile(raw)).to.deep.equal({
        account_origin: 'https://app.dev.xano.com',
        branch: 'dev-feature',
        instance_origin: 'https://x62j.dev.xano.io',
        profile: 'staging',
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

    it('parses boolean fast and writeback', () => {
      expect(parseLocalProfile('fast: true\nwriteback: false')).to.deep.equal({fast: true, writeback: false})
    })

    it('recognizes a file that only sets fast', () => {
      expect(parseLocalProfile('fast: true')).to.deep.equal({fast: true})
    })

    it('recognizes a file that only sets writeback', () => {
      expect(parseLocalProfile('writeback: true')).to.deep.equal({writeback: true})
    })

    it('throws when fast is not a boolean', () => {
      expect(() => parseLocalProfile('fast: maybe')).to.throw(/fast must be a boolean/)
    })

    it('throws when writeback is not a boolean', () => {
      expect(() => parseLocalProfile('writeback: 1')).to.throw(/writeback must be a boolean/)
    })

    it('parses writeback_object_limit as a non-negative integer', () => {
      expect(parseLocalProfile('writeback_object_limit: 50')).to.deep.equal({writeback_object_limit: 50})
      expect(parseLocalProfile('writeback_object_limit: 0')).to.deep.equal({writeback_object_limit: 0})
    })

    it('throws when writeback_object_limit is not a non-negative integer', () => {
      for (const value of ['-1', '2.5', '"50"', 'true']) {
        expect(() => parseLocalProfile(`writeback_object_limit: ${value}`)).to.throw(
          /writeback_object_limit must be a non-negative integer/,
        )
      }
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

    it('does not copy fast or writeback onto the profile', () => {
      const result = applyLocalOverrides(base, {fast: true, workspace: '110', writeback: true})
      expect(result.workspace).to.equal('110')
      expect((result as unknown as Record<string, unknown>).fast).to.equal(undefined)
      expect((result as unknown as Record<string, unknown>).writeback).to.equal(undefined)
    })
  })

  describe('resolveProfileSelection', () => {
    it('uses the explicit profile and skips local overrides when -p/env is set', () => {
      const result = resolveProfileSelection({
        defaultProfile: 'default',
        explicitProfile: 'heimstaden',
        hasLocal: true,
        localProfileName: 'staging',
      })
      expect(result).to.deep.equal({applyLocal: false, profileName: 'heimstaden'})
    })

    it('uses the local profile name and applies overrides when no explicit profile', () => {
      const result = resolveProfileSelection({
        defaultProfile: 'default',
        hasLocal: true,
        localProfileName: 'staging',
      })
      expect(result).to.deep.equal({applyLocal: true, profileName: 'staging'})
    })

    it('falls back to the default profile but still applies overrides when local omits a name', () => {
      const result = resolveProfileSelection({
        defaultProfile: 'default',
        hasLocal: true,
      })
      expect(result).to.deep.equal({applyLocal: true, profileName: 'default'})
    })

    it('uses the default profile when there is no local file', () => {
      const result = resolveProfileSelection({
        defaultProfile: 'default',
        hasLocal: false,
      })
      expect(result).to.deep.equal({applyLocal: false, profileName: 'default'})
    })
  })

  describe('resolvePushDefaults', () => {
    it('defaults both flags to false', () => {
      expect(resolvePushDefaults({sync: false})).to.deep.equal({fast: false, fromLocal: [], writeback: false})
    })

    it('uses profile.yaml when the flag is unset', () => {
      expect(resolvePushDefaults({localFast: true, localWriteback: true, sync: false})).to.deep.equal({
        fast: true,
        fromLocal: ['fast', 'writeback'],
        writeback: true,
      })
    })

    it('lets an explicit flag override profile.yaml', () => {
      expect(
        resolvePushDefaults({flagFast: true, flagWriteback: false, localFast: false, localWriteback: true, sync: false}),
      ).to.deep.equal({fast: true, fromLocal: [], writeback: false})
    })

    it('lets --no-fast override profile.yaml fast: true', () => {
      expect(resolvePushDefaults({flagFast: false, localFast: true, sync: false})).to.deep.equal({
        fast: false,
        fromLocal: [],
        writeback: false,
      })
    })

    it('ignores profile.yaml fast when --sync is passed', () => {
      expect(resolvePushDefaults({localFast: true, sync: true})).to.deep.equal({
        fast: false,
        fromLocal: [],
        writeback: false,
      })
    })

    it('keeps an explicit --fast with --sync so executePush can error', () => {
      expect(resolvePushDefaults({flagFast: true, localFast: true, sync: true})).to.deep.equal({
        fast: true,
        fromLocal: [],
        writeback: false,
      })
    })

    it('still applies writeback from profile.yaml when --sync suppresses fast', () => {
      expect(resolvePushDefaults({localFast: true, localWriteback: true, sync: true})).to.deep.equal({
        fast: false,
        fromLocal: ['writeback'],
        writeback: true,
      })
    })
  })

  describe('formatLocalProfileBanner', () => {
    it('includes the workspace when one is given', () => {
      expect(formatLocalProfileBanner('staging', '110', 'profile.yaml')).to.equal(
        "Using profile 'staging' (workspace 110) · profile.yaml",
      )
    })

    it('omits the workspace clause when not given', () => {
      expect(formatLocalProfileBanner('staging', undefined, 'profile.yaml')).to.equal(
        "Using profile 'staging' · profile.yaml",
      )
    })
  })

  describe('formatWorkspacePushDefaultsBanner', () => {
    it('joins flags with a middle dot and the relative path', () => {
      expect(formatWorkspacePushDefaultsBanner(['fast', 'writeback'], 'profile.yaml')).to.equal(
        'Using --fast --writeback · profile.yaml',
      )
    })

    it('works with a single flag and a nested path', () => {
      expect(formatWorkspacePushDefaultsBanner(['writeback'], '../profile.yaml')).to.equal(
        'Using --writeback · ../profile.yaml',
      )
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
