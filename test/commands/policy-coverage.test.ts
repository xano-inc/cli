import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import PolicyCoverage from '../../src/commands/policy/coverage/index.js'
import {coverageChip, parseObjectRef} from '../../src/utils/policy/coverage.js'
import {json, policyFixture} from '../helpers/policy-fixture.js'

const note = 'Full policy details need the workspace:policy read permission.'
const answer = {
  access: 'coverage',
  findings: [
    {
      blocking: true,
      check: {description: 'Requires every endpoint to declare authentication.', fix_hint: 'Set auth on the endpoint.', label: 'Endpoints require authentication'},
      deleted: false,
      id: 'AUTH-010.R1:query:42',
      message: 'query "orders" (GET) has no authentication',
      object: {app_id: 3, id: 42, name: 'orders', type: 'query'},
      policy_key: 'AUTH-010',
      policy_title: 'Endpoints require login',
      rule_title: 'Endpoint requires authentication',
    },
    {
      blocking: false,
      check: null,
      deleted: false,
      id: 'LOG-003.R1:query:42',
      message: 'query "orders" logs its input',
      object: {app_id: 3, id: 42, name: 'orders', type: 'query'},
      policy_key: 'LOG-003',
      policy_title: '',
      rule_title: 'Logs leave out request input',
    },
  ],
  note,
  object: {app_id: 3, id: 42, name: 'orders', type: 'query'},
  policies: [
    {blocking: true, enforcement: 'blocking', key: 'AUTH-010', reasons: ['every endpoint in API group public'], status: 'failing', title: 'Endpoints require login'},
    {blocking: false, enforcement: 'advisory', key: 'LOG-002', reasons: ['every endpoint'], status: 'passing', title: ''},
  ],
  run: {started_at: '2026-10-08T14:02:11.000Z', status: 'fail'},
  summary: {advisory: 1, applies: 2, blocking: 1, not_checked: 0, passing: 1, state: 'findings'},
}

describe('policy coverage', () => {
  const fixture = policyFixture()

  it('reads one object\'s coverage on the profile\'s branch and prints it as Studio\'s panel does', async () => {
    fixture.route(() => json(answer))
    const result = await runCommand(['policy', 'coverage', 'query:42'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls).to.have.length(1)
    expect(fixture.calls[0].method).to.equal('GET')
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/policy/object/coverage')
    expect(Object.fromEntries(fixture.calls[0].url.searchParams)).to.deep.equal({branch: 'feature', id: '42', type: 'query'})
    expect(result.stdout).to.contain('query orders (id 42): Policies 1 blocking · 1 advisory')
    expect(result.stdout).to.contain('Latest run: 2026-10-08T14:02:11.000Z (fail)')
    expect(result.stdout).to.contain('Blocking findings (1):\n  Endpoint requires authentication (AUTH-010 Endpoints require login)  query orders: query "orders" (GET) has no authentication\n    Fix: Set auth on the endpoint.')
    expect(result.stdout).to.contain('Advisory findings (1):\n  Logs leave out request input (LOG-003)  query orders: query "orders" logs its input\n')
    expect(result.stdout).to.contain('Policies that apply (2):\n  AUTH-010  Blocking  failing  Endpoints require login\n    Applies: every endpoint in API group public\n  LOG-002  Advisory  passing\n    Applies: every endpoint')
    expect(result.stdout.trimEnd().endsWith(note)).to.equal(true)
    expect(process.exitCode ?? 0).to.equal(0)
  })

  it('passes the platform\'s answer through under -o json, on the branch -b names', async () => {
    fixture.route(() => json(answer))
    const result = await runCommand(['policy', 'coverage', 'Function:12', '-b', 'dev', '-o', 'json'], fixture.config)
    expect(JSON.parse(result.stdout)).to.deep.equal(answer)
    expect(Object.fromEntries(fixture.calls[0].url.searchParams)).to.deep.equal({branch: 'dev', id: '12', type: 'function'})
  })

  it('refuses an object not written type:id before any request', async () => {
    fixture.route(() => json(answer))
    for (const object of ['42', 'query', 'query:0', 'query:abc', 'query:1:2']) {
      // eslint-disable-next-line no-await-in-loop
      const result = await runCommand(['policy', 'coverage', object], fixture.config)
      expect(result.error?.oclif?.exit).to.equal(1)
      expect(result.error?.message).to.contain('Name the object as type:id')
    }

    expect(fixture.calls).to.have.length(0)
  })

  it('explains a missing object read permission, which is all coverage needs', async () => {
    const message = 'Reading this function needs the workspace:function read permission.'
    fixture.route(() => json({code: 'ERROR_CODE_ACCESS_DENIED', message, payload: {code: 'policy_object_permission_required', level: 'read', permission: 'workspace:function', type: 'function'}}, 403))
    const result = await runCommand(['policy', 'coverage', 'function:12'], fixture.config)
    expect(result.error?.oclif?.exit).to.equal(1)
    expect(result.error?.message).to.contain(message)
    expect(result.error?.message).to.contain('Your role or this token lacks the `workspace:function` read permission for this object')
    expect(result.error?.message).to.contain('An instance admin grants it to your role; a Metadata API token needs that scope')
    expect(result.error?.message).to.contain('Manage Access Tokens').and.to.contain('not `workspace:policy`')
  })

  it('names the workspace\'s own id as the workspace object\'s id in its argument help', () => {
    expect(PolicyCoverage.args.object.description).to.contain('for workspace, the workspace\'s own id (workspace:17)')
  })

  it('words every chip state as Studio does', () => {
    expect(coverageChip({state: 'none_apply'})).to.equal('Policies · None apply')
    expect(coverageChip({advisory: 0, blocking: 2, state: 'findings'})).to.equal('Policies 2 blocking · 0 advisory')
    expect(coverageChip({applies: 3, state: 'not_checked'})).to.equal('Policies · 3 apply · not checked yet')
    expect(coverageChip({state: 'check_failed'})).to.equal('Policies · Last check failed')
    expect(coverageChip({passing: 6, state: 'pass'})).to.equal('Policies ✓ 6 pass')
  })

  it('reads an object reference as findings write one', () => {
    expect(parseObjectRef(' workflow_test:7 ')).to.deep.equal({id: 7, type: 'workflow_test'})
    expect(parseObjectRef('query:')).to.equal(null)
  })

  it('says when the branch has no run yet', async () => {
    fixture.route(() => json({...answer, findings: [], run: null, summary: {applies: 2, state: 'not_checked'}}))
    const result = await runCommand(['policy', 'coverage', 'query:42'], fixture.config)
    expect(result.stdout).to.contain('Policies · 2 apply · not checked yet').and.to.contain('No run yet')
  })
})
