import {expect} from 'chai'

import {matchInstance} from '../../../src/commands/auth/index.js'

const instances = [
  {display: '1. Justin (Primary)', id: '6670', name: 'xhge-9miy-elpu', origin: 'https://xhge-9miy-elpu.dev.xano.io'},
  {display: 'Staging', id: 'xrk1-k3oy-oldf', name: 'xrk1-k3oy-oldf', origin: 'https://xrk1-k3oy-oldf.dev.xano.io'},
  {display: 'US-1 (Production)', id: '42', name: 'prod-east', origin: 'https://x8ab-99zz-prod.xano.io'},
]

describe('matchInstance', () => {
  it('matches a numeric value by instance ID', () => {
    expect(matchInstance(instances, '6670')?.name).to.equal('xhge-9miy-elpu')
    expect(matchInstance(instances, '42')?.name).to.equal('prod-east')
  })

  it('matches by exact name', () => {
    expect(matchInstance(instances, 'prod-east')?.id).to.equal('42')
    expect(matchInstance(instances, 'xrk1-k3oy-oldf')?.id).to.equal('xrk1-k3oy-oldf')
  })

  it('matches a full instance URL by origin hostname', () => {
    expect(matchInstance(instances, 'https://xhge-9miy-elpu.dev.xano.io')?.id).to.equal('6670')
  })

  it('matches an instance URL regardless of path or trailing slash', () => {
    expect(matchInstance(instances, 'https://xhge-9miy-elpu.dev.xano.io/api:meta')?.id).to.equal('6670')
    expect(matchInstance(instances, 'https://x8ab-99zz-prod.xano.io/')?.name).to.equal('prod-east')
  })

  it('matches a bare hostname', () => {
    expect(matchInstance(instances, 'x8ab-99zz-prod.xano.io')?.name).to.equal('prod-east')
  })

  it('is case-insensitive on hostnames', () => {
    expect(matchInstance(instances, 'HTTPS://XHGE-9MIY-ELPU.DEV.XANO.IO')?.id).to.equal('6670')
  })

  it('trims surrounding whitespace', () => {
    expect(matchInstance(instances, '  6670  ')?.name).to.equal('xhge-9miy-elpu')
    expect(matchInstance(instances, ' prod-east ')?.id).to.equal('42')
  })

  it('returns undefined when nothing matches', () => {
    expect(matchInstance(instances, 'nope')).to.equal(undefined)
    expect(matchInstance(instances, '9999')).to.equal(undefined)
    expect(matchInstance(instances, 'https://unknown.xano.io')).to.equal(undefined)
  })

  it('does not let a numeric query fall through to name matching', () => {
    const withNumericName = [{display: 'X', id: '7', name: '123', origin: 'https://a.xano.io'}]
    expect(matchInstance(withNumericName, '123')).to.equal(undefined)
  })
})
