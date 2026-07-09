import {expect} from 'chai'

import {generateBuildName} from '../../../../src/commands/static_host/build/create/index.js'

describe('generateBuildName', () => {
  it('formats a timestamp as YYYYMMDD-HHmmss', () => {
    // Local-time constructor: 2026-05-31 14:30:22
    const date = new Date(2026, 4, 31, 14, 30, 22)
    expect(generateBuildName(date)).to.equal('20260531-143022')
  })

  it('zero-pads single-digit month, day, and time parts', () => {
    const date = new Date(2026, 0, 5, 3, 7, 9)
    expect(generateBuildName(date)).to.equal('20260105-030709')
  })

  it('produces a name when called with no argument', () => {
    expect(generateBuildName()).to.match(/^\d{8}-\d{6}$/)
  })
})
