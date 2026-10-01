import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {json, policyFixture} from '../../helpers/policy-fixture.js'

describe('function run', () => {
  const fixture = policyFixture()

  const runResponse = () => fixture.route(() => json({result: 42, status: 'ok'}))
  const runCall = () => fixture.calls.find((call) => call.url.pathname.endsWith('/run'))

  it('runs against the workspace when no tenant is given', async () => {
    runResponse()
    const result = await runCommand(['function', 'run', 'calcScore', '--no-input-check'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(runCall()?.url.pathname).to.equal('/api:meta/workspace/1/function/run')
    expect(result.stdout.trim()).to.equal('42')
  })

  it('runs against the tenant with --tenant', async () => {
    runResponse()
    const result = await runCommand(['function', 'run', 'calcScore', '--tenant', 'my-tenant', '--no-input-check'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(runCall()?.method).to.equal('POST')
    expect(runCall()?.url.pathname).to.equal('/api:meta/workspace/1/tenant/my-tenant/function/run')
    expect(JSON.parse(runCall()?.body ?? '{}')).to.deep.equal({branch: 'feature', input: {}, name: 'calcScore'})
  })

  it('accepts -t as the short form of --tenant', async () => {
    runResponse()
    await runCommand(['function', 'run', 'calcScore', '-t', 'acme', '--no-input-check'], fixture.config)
    expect(runCall()?.url.pathname).to.equal('/api:meta/workspace/1/tenant/acme/function/run')
  })
})
