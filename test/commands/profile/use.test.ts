import {expect} from 'chai'

import {ensureGitignoreEntry} from '../../../src/commands/profile/use/index.js'

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
