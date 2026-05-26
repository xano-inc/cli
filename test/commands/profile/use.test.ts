import {expect} from 'chai'

import {buildProfileYaml, ensureGitignoreEntry} from '../../../src/commands/profile/use/index.js'
import {parseLocalProfile} from '../../../src/utils/local-config.js'

describe('profile use helpers', () => {
  describe('ensureGitignoreEntry', () => {
    it('appends the entry to existing content that lacks it', () => {
      const result = ensureGitignoreEntry('node_modules\ndist\n', 'profile.yaml')
      expect(result).to.deep.equal({changed: true, content: 'node_modules\ndist\nprofile.yaml\n'})
    })

    it('adds a trailing newline before appending when missing', () => {
      const result = ensureGitignoreEntry('node_modules', 'profile.yaml')
      expect(result).to.deep.equal({changed: true, content: 'node_modules\nprofile.yaml\n'})
    })

    it('creates content from null', () => {
      const result = ensureGitignoreEntry(null, 'profile.yaml')
      expect(result).to.deep.equal({changed: true, content: 'profile.yaml\n'})
    })

    it('does not duplicate an entry already present as a line', () => {
      const result = ensureGitignoreEntry('dist\nprofile.yaml\n', 'profile.yaml')
      expect(result).to.deep.equal({changed: false, content: 'dist\nprofile.yaml\n'})
    })

    it('does not treat a substring match as present', () => {
      const result = ensureGitignoreEntry('my-profile.yaml.bak\n', 'profile.yaml')
      expect(result.changed).to.equal(true)
    })
  })

  describe('buildProfileYaml', () => {
    it('emits profile: <name> uncommented', () => {
      const output = buildProfileYaml({profile: 'brice-dev'})
      expect(output).to.contain('profile: brice-dev')
      expect(output).not.to.match(/^#.*profile: brice-dev/m)
    })

    it('emits a set workspace field uncommented and unset fields commented', () => {
      const output = buildProfileYaml({profile: 'brice-dev', workspace: '110'})
      expect(output).to.contain('workspace: 110')
      expect(output).not.to.match(/^#.*workspace: 110/m)
      expect(output).to.match(/^# instance_origin:/m)
      expect(output).to.match(/^# account_origin:/m)
      expect(output).to.match(/^# branch:/m)
    })

    it('comments all four override fields when only profile is set', () => {
      const output = buildProfileYaml({profile: 'brice-dev'})
      expect(output).to.match(/^# workspace:/m)
      expect(output).to.match(/^# instance_origin:/m)
      expect(output).to.match(/^# account_origin:/m)
      expect(output).to.match(/^# branch:/m)
    })

    it('round-trips through parseLocalProfile correctly', () => {
      const config = {branch: 'dev', profile: 'brice-dev', workspace: '110'}
      const parsed = parseLocalProfile(buildProfileYaml(config))
      expect(parsed).to.deep.equal({branch: 'dev', profile: 'brice-dev', workspace: '110'})
    })

    it('ends with a trailing newline', () => {
      const output = buildProfileYaml({profile: 'brice-dev'})
      expect(output).to.match(/\n$/)
    })
  })
})
