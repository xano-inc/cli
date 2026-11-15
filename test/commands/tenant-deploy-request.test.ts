import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {json, policyFixture} from '../helpers/policy-fixture.js'

describe('tenant_deploy_request create and edit', () => {
  const fixture = policyFixture()

  it('create opens the request without a reviewer list', async () => {
    fixture.route(() => json({id: 7, status: 'pending', title: 'Deploy_v1.2'}))
    const result = await runCommand(
      ['tenant_deploy_request', 'create', 'Deploy_v1.2', '--tenant', 'prod', '--release', 'v1.2'],
      fixture.config,
    )
    expect(result.error).to.be.undefined
    expect(result.stdout).to.contain('Created deploy request #7: "Deploy_v1.2" [pending]')
    expect(fixture.calls).to.have.length(1)
    expect(fixture.calls[0].method).to.equal('POST')
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/approval_request')
    expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({
      release_name: 'v1.2',
      status: 'pending',
      tenant_name: 'prod',
      title: 'Deploy_v1.2',
    })
  })

  it('create no longer accepts --reviewers', async () => {
    fixture.route(() => json({id: 7, status: 'pending', title: 'x'}))
    const result = await runCommand(
      ['tenant_deploy_request', 'create', 'x', '--tenant', 'prod', '--release', 'v1.2', '--reviewers', '12'],
      fixture.config,
    )
    expect(result.error?.message).to.contain('--reviewers')
    expect(fixture.calls).to.have.length(0)
  })

  it('edit keeps the current description and sends no reviewer list', async () => {
    fixture.route((_url, method) =>
      method === 'GET'
        ? json({description: 'Old notes', id: 12, status: 'pending', title: 'Old title'})
        : json({id: 12, status: 'pending', title: 'Renamed'}),
    )
    const result = await runCommand(['tenant_deploy_request', 'edit', '12', '--title', 'Renamed'], fixture.config)
    expect(result.error).to.be.undefined
    expect(result.stdout).to.contain('Updated deploy request #12: "Renamed" [pending]')
    const put = fixture.calls.find((call) => call.method === 'PUT')
    expect(JSON.parse(put!.body!)).to.deep.equal({description: 'Old notes', title: 'Renamed'})
  })

  it('edit no longer accepts --reviewers', async () => {
    fixture.route(() => json({id: 12, status: 'pending', title: 'x'}))
    const result = await runCommand(['tenant_deploy_request', 'edit', '12', '--reviewers', '12'], fixture.config)
    expect(result.error?.message).to.contain('--reviewers')
    expect(fixture.calls).to.have.length(0)
  })
})
