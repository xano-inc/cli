/* eslint-disable camelcase */
import {expect} from 'chai'

import {Branch, filterBackups} from '../../../src/commands/branch/list/index.js'

const branches: Branch[] = [
  {backup: false, created_at: '2024-01-01', label: 'v1', live: true},
  {backup: false, created_at: '2024-01-02', label: 'dev', live: false},
  {backup: true, created_at: '2024-01-15', label: 'backup_2024_01_15', live: false},
  {backup: true, created_at: '2024-01-16', label: 'backup_2024_01_16', live: false},
]

describe('filterBackups', () => {
  it('hides backup branches by default', () => {
    const result = filterBackups(branches, false)
    expect(result).to.have.lengthOf(2)
    expect(result.map((b) => b.label)).to.deep.equal(['v1', 'dev'])
  })

  it('includes backup branches when includeBackups is true', () => {
    const result = filterBackups(branches, true)
    expect(result).to.have.lengthOf(4)
    expect(result.map((b) => b.label)).to.deep.equal([
      'v1',
      'dev',
      'backup_2024_01_15',
      'backup_2024_01_16',
    ])
  })

  it('returns empty array when all branches are backups and includeBackups is false', () => {
    const onlyBackups = branches.filter((b) => b.backup)
    expect(filterBackups(onlyBackups, false)).to.deep.equal([])
  })

  it('returns the same array reference semantics when includeBackups is true', () => {
    expect(filterBackups(branches, true)).to.equal(branches)
  })
})
