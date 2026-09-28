import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy-fixture.js'

/** An error or warning as one line: oclif wraps it at the terminal width behind a ` › ` gutter. */
const oneLine = (text: string) => text.replaceAll(/\s*›\s*/g, ' ').replaceAll(/\s+/g, ' ').trim()

const finding = {
  id: 'AUTH-001.R1:query:18',
  message: 'Endpoint has no authentication.',
  object: {name: 'GET /orders', type: 'query'},
  policy_key: 'AUTH-001',
  rule_id: 'R1',
  severity: 'high',
}

/** A blocked verdict for release v1.2 on a gated tenant whose current release is v1.1. */
const blocked = {
  base_release: {carried: true, id: 11, name: 'v1.1', run_id: 540, status: 'pass'},
  can_override: true,
  changed: 0,
  existing: 2,
  findings: [{gate_reason: 'introduced', ...finding}],
  gate: 'tenant_deploy',
  gated: true,
  introduced: 1,
  message: 'Deploy blocked: 1 blocking policy finding this release introduces; it weakens 1 mandatory policy the tenant runs under (SEC-002).',
  regressions: [{change: 'rules_changed', enforcement: 'mandatory', key: 'SEC-002', rules: [{check: 'object.auth_required', id: 'R2', title: 'Signed in'}], title: 'Secrets'}],
  regressions_total: 1,
  release: {carried: true, id: 12, name: 'v1.2', run_id: 555, status: 'fail'},
  removed: [{active: true, enforcement: 'advisory', key: 'OLD-001', title: 'Old rule'}],
  removed_total: 1,
  run_id: 555,
  status: 'blocked',
  total: 1,
  truncated: false,
}

const passed = {
  base_release: null,
  can_override: true,
  existing: 0,
  findings: [],
  gate: 'tenant_deploy',
  gated: true,
  introduced: 0,
  message: 'No blocking policy findings are introduced, and no policy the tenant runs under is weakened.',
  regressions: [],
  release: {carried: true, id: 12, name: 'v1.2', run_id: 555, status: 'pass'},
  removed: [],
  status: 'pass',
  total: 0,
}

const refusal = (answer: Record<string, unknown>, gate = 'tenant_deploy') =>
  json({code: 'ERROR_CODE_ACCESS_DENIED', message: String(answer.message), payload: {code: 'policy_gate', ...answer, gate}}, 403)

const policyRefusal = (code: string, status = 403) => json({code: 'ERROR_CODE_ACCESS_DENIED', message: 'Refused.', payload: {code, level: 'read'}}, status)

describe('release policy checks', () => {
  const fixture = policyFixture()

  describe('the check a release cut stores', () => {
    const recorded = {advisory: 1, blocking: 2, run_id: 1712, run_status: 'fail', status: 'recorded'}

    it('release create prints the recorded check and where to read it', async () => {
      fixture.route(() => json({branch: 'main', id: 12, name: 'v1.2', policy_run: recorded}))
      const result = await runCommand(['release', 'create', 'v1.2', '--branch', 'main'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/release')
      expect(result.stdout).to.contain('Policy check: fail (run 1712), 2 blocking, 1 advisory findings')
      expect(result.stdout).to.contain('Findings: xano policy runs --release v1.2')
      expect(result.stdout).to.contain('xano tenant deploy_release <tenant> --release v1.2 --check')
      expect(process.exitCode ?? 0).to.equal(0)
    })

    it('release create keeps the check in JSON', async () => {
      fixture.route(() => json({id: 12, name: 'v1.2', policy_run: recorded}))
      const result = await runCommand(['release', 'create', 'v1.2', '--branch', 'main', '-o', 'json'], fixture.config)
      expect(JSON.parse(result.stdout).policy_run).to.deep.equal(recorded)
    })

    for (const [check, line] of [
      [{message: 'Policies are not enabled on this instance; nothing was evaluated.', status: 'disabled'}, 'Policy check disabled: Policies are not enabled on this instance; nothing was evaluated.'],
      [{message: 'No release to check.', status: 'skipped'}, 'Policy check skipped: No release to check.'],
      [{message: 'The policy check could not run.', status: 'error'}, 'Policy check error: The policy check could not run.'],
      [{advisory: 0, blocking: 0, run_id: 1713, run_status: 'pass', status: 'recorded'}, 'Policy check: pass (run 1713), no findings'],
    ] as const) {
      it(`release create prints a ${check.status} check`, async () => {
        fixture.route(() => json({id: 12, name: 'v1.2', policy_run: check}))
        const result = await runCommand(['release', 'create', 'v1.2', '--branch', 'main'], fixture.config)
        expect(result.stdout).to.contain(line)
        expect(result.stdout).not.to.contain('--check')
      })
    }

    it('release create says nothing about a check a credential cannot read', async () => {
      fixture.route(() => json({id: 12, name: 'v1.2', policy_run: null}))
      const result = await runCommand(['release', 'create', 'v1.2', '--branch', 'main'], fixture.config)
      expect(result.stdout).to.contain('Created release: v1.2').and.not.to.contain('Policy check')
    })

    it('release push prints the check of the release it cut', async () => {
      const tree = path.join(fixture.directory, 'release-tree')
      fs.mkdirSync(tree, {recursive: true})
      fs.writeFileSync(path.join(tree, 'helper.xs'), 'function helper {\n  input {\n  }\n\n  stack {\n  }\n\n  response = null\n}')
      fixture.route(() => json({id: 13, name: 'v2', policy_run: recorded}))
      const result = await runCommand(['release', 'push', '-n', 'v2', '-d', tree], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(result.stdout).to.contain('Policy check: fail (run 1712), 2 blocking, 1 advisory findings')
    })

    it('release import prints the check of the release it imported', async () => {
      const archive = path.join(fixture.directory, 'release.tar.gz')
      fs.writeFileSync(archive, 'not really gzip')
      fixture.route(() => json({id: 14, policy_run: recorded}))
      const result = await runCommand(['release', 'import', '--file', archive], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(result.stdout).to.contain('Imported release as #14')
      expect(result.stdout).to.contain('Policy check: fail (run 1712)').and.to.contain('xano policy runs --release-id 14')
      expect(result.stdout).not.to.contain('<release_name>')
    })
  })

  /** The tenant list the approval pre-flight reads (no approval needed), the gate preview, and `deploy` for the deploy. */
  function tenantRoutes(deploy: () => Response, gate: () => Response = () => json(passed)): void {
    fixture.route((url) => {
      if (url.pathname.endsWith('/tenant')) return json({items: [{deploy_settings: {}, id: 5, name: 'prod'}]})
      if (url.pathname.endsWith('/policy_gate')) return gate()
      if (url.pathname.endsWith('/deploy')) return deploy()
      throw new Error(`unexpected request ${url.pathname}`)
    })
  }

  describe('tenant deploy_release and the policy gate', () => {

    for (const status of ['unavailable', 'not_carried']) {
      it(`--check reports ${status} without inventing a verdict and exits 0`, async () => {
        tenantRoutes(() => { throw new Error('deployed') }, () => json({
          ...passed, release: {carried: false, id: 12, name: 'v1.2', status}, status,
        }))
        const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2', '--check'], fixture.config)
        expect(result.error).to.equal(undefined)
        expect(result.stdout).to.contain(`Policy gate: ${status}`)
        expect(result.stdout).to.contain(status === 'not_carried' ? 'cut without its policies' : 'v1.2 (unavailable)')
        if (status === 'unavailable') expect(result.stdout).not.to.contain('cut without its policies')
        expect(fixture.calls).to.have.length(1)
        expect(process.exitCode ?? 0).to.equal(0)
      })
    }

    it('a non-reader gate refusal reports counts and the permission without policy details', async () => {
      tenantRoutes(() => refusal({...blocked, can_override: false, findings: undefined,
        message: 'Deploy blocked: 1 introduced finding; 1 mandatory policy weakened.', regressions: undefined, removed: undefined}))
      const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2'], fixture.config)
      expect(result.stdout).to.contain('workspace:policy read').and.to.contain('Mandatory policies this release weakens: 1')
      expect(result.stdout).not.to.contain('AUTH-001').and.not.to.contain('SEC-002')
      expect(result.error).to.have.nested.property('oclif.exit', 2)
    })

    it('--check previews the verdict without deploying and exits 2 when the deploy would be refused', async () => {
      tenantRoutes(() => { throw new Error('deployed') }, () => json(blocked))
      const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2', '--check'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls).to.have.length(1)
      expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/tenant/prod/policy_gate')
      expect(fixture.calls[0].url.searchParams.get('release_name')).to.equal('v1.2')
      expect(result.stdout).to.contain('nothing was deployed')
      expect(result.stdout).to.contain('Policy gate: blocked')
      expect(result.stdout).to.contain('Release: v1.2 (policy run 555, fail)')
      expect(result.stdout).to.contain("Compared with the tenant's current release: v1.1 (policy run 540, pass)")
      expect(result.stdout).to.contain('Blocking findings: 1 introduced by this release, 2 already in the current release')
      expect(result.stdout).to.contain('SEC-002 (Secrets): rules removed or changed (R2 Signed in)')
      expect(result.stdout).to.contain('OLD-001 (Old rule): advisory, Active')
      expect(result.stdout).to.contain('R1 [high] (AUTH-001)  query GET /orders: Endpoint has no authentication.')
      expect(result.stdout).to.contain('xano tenant deploy_release prod --release v1.2 --override-reason "<why>"')
      expect(process.exitCode).to.equal(2)
    })

    it('--check exits 0 for a passing verdict and for a blocked tenant that is not gated', async () => {
      tenantRoutes(() => { throw new Error('deployed') })
      const pass = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2', '--check'], fixture.config)
      expect(pass.stdout).to.contain('Policy gate: pass').and.to.contain('none (the tenant has no release yet')
      expect(process.exitCode ?? 0).to.equal(0)

      tenantRoutes(() => { throw new Error('deployed') }, () => json({...blocked, gated: false}))
      const ephemeral = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2', '--check'], fixture.config)
      expect(ephemeral.stdout).to.contain('Not gated: this tenant is ephemeral or a sandbox')
      expect(process.exitCode ?? 0).to.equal(0)
    })

    it('--check -o json prints the gate answer as served', async () => {
      tenantRoutes(() => { throw new Error('deployed') }, () => json(blocked))
      const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2', '--check', '-o', 'json'], fixture.config)
      expect(JSON.parse(result.stdout)).to.deep.equal(blocked)
      expect(process.exitCode).to.equal(2)
    })

    it('--check names the remedy when the credential cannot read policies, and exits 1', async () => {
      tenantRoutes(() => { throw new Error('deployed') }, () => policyRefusal('policy_permission_required'))
      const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2', '--check'], fixture.config)
      expect(result.error?.message).to.contain('Policy gate preview failed (403)')
      expect(oneLine(result.error!.message)).to.contain('lacks the `workspace:policy` read permission')
      expect(result.error).to.have.nested.property('oclif.exit', 1)
    })

    it('a deploy the gate refuses prints the verdict and how to override it, and exits 2', async () => {
      tenantRoutes(() => refusal(blocked))
      const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2'], fixture.config)
      expect(result.stdout).to.contain('Policy gate: blocked').and.to.contain('R1 [high]')
      expect(result.error?.message).to.contain('Deploy blocked: 1 blocking policy finding')
      expect(result.error?.message).to.contain('xano tenant deploy_release prod --release v1.2 --override-reason "<why>"')
      expect(result.error?.message).not.to.contain('Failed to deploy to tenant')
      expect(result.error).to.have.nested.property('oclif.exit', 2)
      expect(JSON.parse(fixture.calls.at(-1)!.body!)).to.deep.equal({release_name: 'v1.2'})
    })

    it('a refusal the credential may not override says whose permission it needs', async () => {
      tenantRoutes(() => refusal({...blocked, can_override: false}))
      const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2'], fixture.config)
      expect(result.error?.message).to.contain('needs the `workspace:policy` update permission').and.not.to.contain('--override-reason')
      expect(result.error).to.have.nested.property('oclif.exit', 2)
    })

    it('a refusal under -o json is the verdict as JSON', async () => {
      tenantRoutes(() => refusal(blocked))
      const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2', '-o', 'json'], fixture.config)
      const output = JSON.parse(result.stdout)
      expect(output.deployed).to.equal(false)
      expect(output.policy_gate.status).to.equal('blocked')
      expect(output.policy_gate.code).to.equal('policy_gate')
      expect(result.error).to.have.nested.property('oclif.exit', 2)
    })

    it('--override-reason sends the override and prints the verdict the deploy answered', async () => {
      tenantRoutes(() => json({id: 5, name: 'prod', policy_gate: {...blocked, status: 'overridden'}, release: {name: 'v1.2'}}))
      const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2', '--override-reason', '"Tracked in JIRA-12"'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(fixture.calls.at(-1)!.body!)).to.deep.equal({override_policy: true, override_reason: 'Tracked in JIRA-12', release_name: 'v1.2'})
      expect(result.stdout).to.contain('Policy gate: overridden')
    })

    it('a deploy to an ungated tenant that the gate would block says the deploy went ahead', async () => {
      tenantRoutes(() => json({id: 5, name: 'prod', policy_gate: {...blocked, gated: false}, release: {name: 'v1.2'}}))
      const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(result.stdout).to.contain('Policy gate: blocked (not gated: this tenant is ephemeral or a sandbox, so the deploy went ahead)')
    })

    it('--override-reason needs a reason, and --check never deploys with one', async () => {
      tenantRoutes(() => { throw new Error('deployed') })
      const empty = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2', '--override-reason', '" "'], fixture.config)
      expect(empty.error?.message).to.contain('--override-reason needs a reason')
      const both = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2', '--check', '--override-reason', 'x'], fixture.config)
      expect(both.error?.message).to.contain('cannot also be provided')
      expect(both.error).to.have.nested.property('oclif.exit', 1)
      expect(fixture.calls).to.have.length(0)
    })

    it('a 403 that is not the policy gate keeps its message', async () => {
      tenantRoutes(() => json({code: 'ERROR_CODE_ACCESS_DENIED', message: 'Access denied.'}, 403))
      const result = await runCommand(['tenant', 'deploy_release', 'prod', '--release', 'v1.2'], fixture.config)
      expect(result.error?.message).to.equal('Failed to deploy to tenant: Access denied.')
      expect(result.error).to.have.nested.property('oclif.exit', 1)
    })
  })

  describe('tenant deploy requests and the policy gate', () => {
    const request = {
      _release: {id: 12, name: 'v1.2'},
      _tenant: {id: 5, name: 'prod'},
      deployment: {release: {id: 12}, tenant: {id: 5}},
      id: 7,
      status: 'pending',
      title: 'Deploy v1.2 to prod',
    }

    function requestRoutes(gate: () => Response): void {
      fixture.route((url) => url.pathname.endsWith('/policy_gate') ? gate() : json(request))
    }

    for (const status of ['approved', 'closed']) {
      it(`get names the tenant and release of a ${status} request without checking it again`, async () => {
        fixture.route(url => {
          if (url.pathname.endsWith('/policy_gate')) throw new Error('historical request rechecked')
          return json({...request, status})
        })
        const result = await runCommand(['tenant_deploy_request', 'get', '7'], fixture.config)
        expect(result.error).to.equal(undefined)
        expect(result.stdout).to.contain('Tenant: prod').and.to.contain('Release: v1.2')
        expect(result.stdout).not.to.contain('Policy gate').and.not.to.contain('not available')
        expect(fixture.calls).to.have.length(1)
      })
    }

    for (const command of ['set_status', 'bypass']) {
      const args = command === 'set_status' ? ['--status', 'approve'] : ['--reason', 'Incident']
      it(`${command} emits a JSON policy refusal and exits 2`, async () => {
        fixture.route(() => refusal(blocked, command === 'set_status' ? 'tenant_approve' : 'tenant_deploy'))
        const result = await runCommand(['tenant_deploy_request', command, '7', ...args, '-o', 'json'], fixture.config)
        expect(JSON.parse(result.stdout)).to.include({deployed: false, message: blocked.message})
        expect(JSON.parse(result.stdout).policy_gate).to.include({code: 'policy_gate', status: 'blocked'})
        expect(result.error).to.have.nested.property('oclif.exit', 2)
      })

      it(`${command} keeps operational failures at exit 1 under JSON output`, async () => {
        fixture.route(() => json({message: 'Not allowed.'}, 403))
        const result = await runCommand(['tenant_deploy_request', command, '7', ...args, '-o', 'json'], fixture.config)
        expect(JSON.parse(result.stdout).error).to.include({exit: 1})
        expect(JSON.parse(result.stdout).error.message).to.contain('Not allowed.')
        expect(result.error?.message).to.contain('Not allowed.')
        expect(result.error).to.have.nested.property('oclif.exit', 1)
      })
    }

    it('get prints the policy check of the request\'s release on its tenant', async () => {
      requestRoutes(() => json(blocked))
      const result = await runCommand(['tenant_deploy_request', 'get', '7'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls[1].url.pathname).to.equal('/api:meta/workspace/1/tenant/prod/policy_gate')
      expect(fixture.calls[1].url.searchParams.get('release_name')).to.equal('v1.2')
      expect(result.stdout).to.contain('Policy check of release "v1.2" on tenant "prod":').and.to.contain('Policy gate: blocked')
      expect(process.exitCode ?? 0).to.equal(0)
    })

    for (const [answer, reason] of [
      [policyRefusal('policy_permission_required'), 'your role lacks the `workspace:policy` read permission'],
      [policyRefusal('policy_feature_disabled'), 'the Policies feature is off on this instance'],
      [json({code: 'ERROR_CODE_NOT_FOUND', message: 'Release not found.'}, 404), 'Release not found.'],
    ] as const) {
      it(`get degrades to "not available" rather than failing (${reason})`, async () => {
        requestRoutes(() => answer.clone())
        const result = await runCommand(['tenant_deploy_request', 'get', '7'], fixture.config)
        expect(result.error).to.equal(undefined)
        expect(result.stdout).to.contain(`Policy checks: not available (${reason})`)
        expect(result.stdout).to.contain('Tenant: prod').and.to.contain('Release: v1.2')
      })
    }

    it('get -o json carries the verdict, or why it is not available', async () => {
      requestRoutes(() => json(passed))
      const read = await runCommand(['tenant_deploy_request', 'get', '7', '-o', 'json'], fixture.config)
      expect(JSON.parse(read.stdout).policy_gate.status).to.equal('pass')

      requestRoutes(() => policyRefusal('policy_permission_required'))
      const refused = await runCommand(['tenant_deploy_request', 'get', '7', '-o', 'json'], fixture.config)
      const output = JSON.parse(refused.stdout)
      expect(output.policy_gate).to.equal(null)
      expect(output.policy_gate_unavailable).to.contain('workspace:policy')
    })

    it('an approve whose deploy the gate refuses prints the verdict, says the request is approved, and exits 2', async () => {
      fixture.route(() => refusal(blocked, 'tenant_approve'))
      const result = await runCommand(['tenant_deploy_request', 'set_status', '7', '--status', 'approve'], fixture.config)
      expect(result.stdout).to.contain('Policy gate: blocked')
      const message = oneLine(result.error!.message)
      expect(message).to.contain('Your approval was recorded and the request is approved, but its release was not deployed.')
      expect(message).to.contain('xano tenant deploy_release <tenant> --release v1.2 --override-reason "<why>"')
      expect(result.error).to.have.nested.property('oclif.exit', 2)
    })

    it('set_status --override-policy sends the override with the reason, only for approve', async () => {
      fixture.route(() => json({approvals_count: 2, fully_approved: true, id: 7, required_reviewers: 2, resolution: {deploy_status: 'deployed'}, status: 'approved'}))
      const result = await runCommand(['tenant_deploy_request', 'set_status', '7', '--status', 'approve', '--override-policy', '--reason', '"Accepted risk"'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({action: 'approve', override_policy: true, reason: 'Accepted risk'})

      const close = await runCommand(['tenant_deploy_request', 'set_status', '7', '--status', 'close', '--override-policy', '--reason', 'x'], fixture.config)
      expect(close.error?.message).to.contain('--override-policy applies only to --status approve')
      const reasonless = await runCommand(['tenant_deploy_request', 'set_status', '7', '--status', 'approve', '--override-policy'], fixture.config)
      expect(reasonless.error?.message).to.contain('--override-policy needs --reason')
      expect(fixture.calls).to.have.length(1)
    })

    it('set_status without --override-policy sends no override', async () => {
      fixture.route(() => json({id: 7, status: 'pending'}))
      await runCommand(['tenant_deploy_request', 'set_status', '7', '--status', 'submit'], fixture.config)
      expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({action: 'submit', reason: ''})
    })

    it('a bypass the gate refuses prints the verdict and how to override it too, and exits 2', async () => {
      fixture.route(() => refusal(blocked))
      const result = await runCommand(['tenant_deploy_request', 'bypass', '7', '--reason', 'Incident'], fixture.config)
      expect(result.stdout).to.contain('Policy gate: blocked')
      expect(result.error?.message).to.contain('xano tenant_deploy_request bypass 7 --reason "<why>" --override-policy')
      expect(result.error).to.have.nested.property('oclif.exit', 2)
    })

    it('bypass --override-policy sends the override with the reason', async () => {
      fixture.route(() => json({approval_id: 7, duration_ms: 1200}))
      const result = await runCommand(['tenant_deploy_request', 'bypass', '7', '--reason', 'Incident', '--override-policy'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(fixture.calls[0].body!)).to.deep.equal({override_policy: true, reason: 'Incident'})
    })
  })

  describe('policy runs --release', () => {
    const run = {
      counts: {advisory: 1, blocking: 1, errors: 0, findings: 2},
      id: 1712,
      objects_checked: 40,
      policies: [{key: 'AUTH-001', rules: [{id: 'R1', label: 'Authentication required'}]}],
      release: {branch: {id: 3, label: 'main'}, id: 12},
      results: [{check_id: 'R1', checked: 40, policy_key: 'AUTH-001', status: 'fail'}],
      shipped: [{active: true, enforcement: 'mandatory', key: 'AUTH-001'}, {active: true, enforcement: 'advisory', key: 'LOG-001'}],
      status: 'fail',
      trigger: 'release',
    }

    const firstPage = {items: [finding], limit: 1, offset: 0, total: 2}

    it('--release-id reads directly without listing releases', async () => {
      releaseRoutes()
      const result = await runCommand(['policy', 'runs', '--release-id', '12', '--limit', '1'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls).to.have.length(2)
      expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/release/12/policy_run')
      expect(result.stdout).to.contain('Next page: `xano policy runs --release-id 12 --offset 1`')
    })

    it('reads enveloped release lists and all matching finding pages', async () => {
      fixture.route(url => {
        if (url.pathname.endsWith('/release')) return json({items: [{id: 12, name: 'v1.2'}]})
        if (url.pathname.endsWith('/findings')) {
          const offset = Number(url.searchParams.get('offset'))
          return json({items: Array.from({length: offset ? 1 : 500}, () => finding), limit: 500, offset, total: 501})
        }

        return json({run})
      })
      const result = await runCommand(['policy', 'runs', '--release', 'v1.2', '--blocking', '--all', '-o', 'json'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout).findings).to.have.length(501)
      expect(JSON.parse(result.stdout).findings_page).to.deep.equal({limit: 501, next_offset: null, offset: 0, total: 501})
      expect(fixture.calls.at(-1)!.url.searchParams.get('offset')).to.equal('500')
      expect(fixture.calls.at(-1)!.url.searchParams.get('blocking')).to.equal('true')
    })

    for (const args of [
      ['--release', 'v1.2', '--release-id', '12'],
      ['--release-id', '12', '--branch', 'dev'],
      ['--release', 'v1.2', '--all', '--limit', '1'],
    ]) {
      it(`rejects conflicting flags ${args.join(' ')} at exit 1 before requesting`, async () => {
        const result = await runCommand(['policy', 'runs', ...args], fixture.config)
        expect(result.error).to.have.nested.property('oclif.exit', 1)
        expect(fixture.calls).to.have.length(0)
      })
    }

    /** Two pages of releases (v1.2 on the second), the release's run, and a page of its findings. */
    function releaseRoutes(stored: unknown = run, findings: unknown = firstPage): void {
      const first = Array.from({length: 100}, (_, index) => ({id: 100 + index, name: `r${index}`}))
      fixture.route((url, method) => {
        if (url.pathname.endsWith('/release')) return json(url.searchParams.get('page') === '1' ? first : [{id: 12, name: 'v1.2'}])
        if (url.pathname.endsWith('/policy_run/findings')) return json(findings)
        if (url.pathname.endsWith('/policy_run')) return json(method === 'POST' ? {check: {advisory: 1, blocking: 1, run_id: 1712, run_status: 'fail', status: 'recorded'}, run: stored} : {run: stored})
        throw new Error(`unexpected request ${url.pathname}`)
      })
    }

    it('finds the release by name and reads its check a page at a time', async () => {
      releaseRoutes()
      const result = await runCommand(['policy', 'runs', '--release', 'v1.2', '--limit', '1'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls.map(call => `${call.method} ${call.url.pathname}`)).to.deep.equal([
        'GET /api:meta/workspace/1/release',
        'GET /api:meta/workspace/1/release',
        'GET /api:meta/workspace/1/release/12/policy_run',
        'GET /api:meta/workspace/1/release/12/policy_run/findings',
      ])
      expect(fixture.calls[3].url.searchParams.get('limit')).to.equal('1')
      expect(result.stdout).to.contain('Release v1.2 (ID 12): ships 2 policies (AUTH-001, LOG-001); checked as cut from branch main')
      expect(result.stdout).to.contain('Run 1712  fail  release')
      expect(result.stdout).to.contain('Findings 1-1 of 2 (one page):')
      expect(result.stdout).to.contain('Next page: `xano policy runs --release v1.2 --offset 1`')
    })

    it('passes the finding filters to the release\'s findings route', async () => {
      releaseRoutes()
      await runCommand(['policy', 'runs', '--release', 'v1.2', '--blocking', '--policy', 'AUTH-001'], fixture.config)
      const query = fixture.calls.at(-1)!.url.searchParams
      expect(query.get('blocking')).to.equal('true')
      expect(query.get('policy[0]')).to.equal('AUTH-001')
    })

    it('-o json is the run with its page of findings', async () => {
      releaseRoutes()
      const result = await runCommand(['policy', 'runs', '--release', 'v1.2', '-o', 'json'], fixture.config)
      const output = JSON.parse(result.stdout)
      expect(output.id).to.equal(1712)
      expect(output.shipped).to.have.length(2)
      expect(output.findings).to.have.length(1)
      expect(output.findings_page).to.deep.equal({limit: 1, next_offset: 1, offset: 0, total: 2})
    })

    it('says when a release has no check', async () => {
      releaseRoutes(null)
      const result = await runCommand(['policy', 'runs', '--release', 'v1.2'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(result.stdout).to.contain('Release v1.2 has no policy check. `--recheck` checks it now from its archive.')
      expect(fixture.calls.some(call => call.url.pathname.endsWith('/findings'))).to.equal(false)

      const asJson = await runCommand(['policy', 'runs', '--release', 'v1.2', '-o', 'json'], fixture.config)
      expect(JSON.parse(asJson.stdout)).to.deep.equal({run: null})
    })

    it('--recheck checks the release again and reads the new run', async () => {
      releaseRoutes()
      const result = await runCommand(['policy', 'runs', '--release', 'v1.2', '--recheck'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls.find(call => call.url.pathname.endsWith('/policy_run'))?.method).to.equal('POST')
      expect(result.stdout).to.contain('Rechecked. Policy check: fail (run 1712), 1 blocking, 1 advisory finding')
      expect(result.stdout).to.contain('Run 1712  fail  release')
    })

    it('refuses a run ID with --release, --recheck without it, and a release it cannot find', async () => {
      releaseRoutes()
      const both = await runCommand(['policy', 'runs', '1712', '--release', 'v1.2'], fixture.config)
      expect(both.error?.message).to.contain('not both')
      const recheck = await runCommand(['policy', 'runs', '--recheck'], fixture.config)
      expect(recheck.error?.message).to.contain('--release')
      const missing = await runCommand(['policy', 'runs', '--release', 'v9'], fixture.config)
      expect(missing.error?.message).to.contain("Release 'v9' not found")
      expect(missing.error).to.have.nested.property('oclif.exit', 1)
    })
  })
})
