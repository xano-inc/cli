import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import path from 'node:path'

import {json, policyFixture} from '../../../helpers/policy-fixture.js'

/**
 * `workspace pull` hands every policy reader the policy files. A developer who then pushes their
 * own work is carrying those files unchanged, and the server lets them through (it compares
 * before it asks for any policy write permission). Only a CHANGED policy file is refused, and
 * then the CLI has to say what to do about it rather than repeat the refusal.
 */
describe('workspace push with policy files, as a non-admin', () => {
  const fixture = policyFixture()
  const push = (...extra: string[]) => runCommand(['workspace', 'push', '-d', fixture.directory, '--no-guids', ...extra], fixture.config)

  beforeEach(() => {
    fs.writeFileSync(path.join(fixture.directory, 'helper.xs'), 'function helper {\n  input {\n  }\n\n  stack {\n  }\n\n  response = null\n}\n')
  })

  it('previews an unchanged policy file as unchanged and exits 0', async () => {
    fixture.route(() => json({
      operations: [
        {action: 'unchanged', details: 'Policy definition is unchanged', name: 'AUTH-001', type: 'policy'},
        {action: 'update', details: 'XS content differs', name: 'helper', type: 'function'},
      ],
      summary: {
        function: {created: 0, deleted: 0, truncated: 0, unchanged: 0, updated: 1},
        policy: {created: 0, deleted: 0, truncated: 0, unchanged: 1, updated: 0},
      },
    }))
    const result = await push('--dry-run')
    expect(result.error).to.equal(undefined)
    expect(fixture.calls).to.have.length(1)
    expect(fixture.calls[0].url.pathname).to.match(/\/multidoc\/dry-run$/)
    expect(`${result.stdout}${result.stderr}`).not.to.contain('admin role')
    expect(process.exitCode ?? 0).to.equal(0)
  })

  it('pushes the rest of the work when the policy file is unchanged', async () => {
    fixture.route(() => json({guid_map: [{guid: 'g-1', name: 'AUTH-001', type: 'policy'}], policy_check: {blocking: false, status: 'pass'}}))
    const result = await push('--force')
    expect(result.error).to.equal(undefined)
    expect(process.exitCode ?? 0).to.equal(0)
    expect(fixture.calls.at(-1)?.method).to.equal('POST')
    // The policy file still travels: the server, not the CLI, decides that it is unchanged.
    expect(fixture.calls.at(-1)?.body).to.contain('policy AUTH-001')
  })

  it('explains a refused policy change instead of repeating it, and imports nothing', async () => {
    fixture.route(() => json({message: 'Policy files require the admin role; nothing was imported: AUTH-001'}, 403))
    const result = await push('--force')
    expect(result.error?.oclif?.exit).to.equal(1)
    expect(result.error?.message).to.contain('Policy files require the admin role; nothing was imported: AUTH-001')
    expect(result.error?.message).to.contain('-e "policies/*"')
    expect(result.error?.message).to.contain('unchanged never cause this')
    expect(result.error?.message).to.contain('changing policies requires the `workspace:policy` permission')
    expect(result.error?.message).not.to.contain('Reissue')
  })

  it('stops at the preview for the same refusal, without --force, and never reaches the import', async () => {
    fixture.route(() => json({message: 'Policy files require the admin role; nothing was imported: AUTH-001'}, 403))
    const result = await push()
    expect(result.error?.oclif?.exit).to.equal(1)
    expect(result.error?.message).to.contain('-e "policies/*"')
    expect(`${result.stdout}${result.stderr}${result.error?.message}`).not.to.contain('Skipping preview')
    expect(fixture.calls).to.have.length(1)
    expect(fixture.calls[0].url.pathname).to.match(/\/multidoc\/dry-run$/)
  })
})
