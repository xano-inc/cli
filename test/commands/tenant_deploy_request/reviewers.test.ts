import {runCommand} from '@oclif/test'
import {expect} from 'chai'

import {json, policyFixture} from '../../helpers/policy-fixture.js'

/** Flatten oclif's ` › `-guttered, width-wrapped error/warning text to one line. */
const oneLine = (text: string) => text.replaceAll(/\s*›\s*/g, ' ').replaceAll(/\s+/g, ' ').trim()

const methods = (fixture: {calls: Array<{method: string}>}) => fixture.calls.map((c) => c.method)

describe('tenant_deploy_request --reviewers asks the named reviewers', () => {
  const fixture = policyFixture()

  // A created/edited request echoes back; a review request returns one activity row per asked user.
  const created = {id: 12, status: 'pending', title: 'Deploy'}

  describe('create', () => {
    it('asks the named reviewer through review_request, not reviewer_ids on create (AC1)', async () => {
      fixture.route((url) =>
        url.pathname.endsWith('/review_request') ? json([{id: 1, target: {id: 45}}]) : json(created),
      )

      const result = await runCommand(
        ['tenant_deploy_request', 'create', 'Deploy', '-t', 'prod', '-r', 'v1.2', '--reviewers', '45'],
        fixture.config,
      )

      expect(result.error).to.equal(undefined)
      expect(fixture.calls).to.have.lengthOf(2) // the create, then the review_request
      // The create POST carries no reviewer_ids (the route drops it).
      expect(fixture.calls[0].method).to.equal('POST')
      expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/approval_request')
      const createBody = JSON.parse(fixture.calls[0].body!)
      expect(createBody).to.not.have.property('reviewer_ids')
      expect(createBody.status).to.equal('pending')
      // The reviewer is asked via the dedicated route.
      expect(fixture.calls[1].method).to.equal('POST')
      expect(fixture.calls[1].url.pathname).to.equal('/api:meta/workspace/1/approval_request/12/review_request')
      expect(JSON.parse(fixture.calls[1].body!)).to.deep.equal({targets: [45]})
      expect(result.stdout).to.contain('Created deploy request #12')
    })

    it('asks every listed user, one targets array (AC2)', async () => {
      fixture.route((url) =>
        url.pathname.endsWith('/review_request') ? json([{id: 1}, {id: 2}, {id: 3}]) : json(created),
      )

      const result = await runCommand(
        ['tenant_deploy_request', 'create', 'Deploy', '-t', 'prod', '-r', 'v1.2', '--reviewers', '12,45,67'],
        fixture.config,
      )

      expect(result.error).to.equal(undefined)
      expect(fixture.calls).to.have.lengthOf(2)
      expect(JSON.parse(fixture.calls[1].body!)).to.deep.equal({targets: [12, 45, 67]})
    })

    it('does NOT ask reviewers for a draft, and warns the operator', async () => {
      fixture.route(() => json({...created, status: 'draft'}))

      const result = await runCommand(
        ['tenant_deploy_request', 'create', 'Deploy', '-t', 'prod', '-r', 'v1.2', '--reviewers', '45', '--draft'],
        fixture.config,
      )

      expect(result.error).to.equal(undefined)
      // Only the create call — no review_request for a draft.
      expect(fixture.calls).to.have.lengthOf(1)
      expect(JSON.parse(fixture.calls[0].body!).status).to.equal('draft')
      expect(oneLine(result.stderr)).to.contain('saved without asking reviewers')
    })

    it('makes no review_request when no reviewers are given', async () => {
      fixture.route(() => json(created))

      const result = await runCommand(
        ['tenant_deploy_request', 'create', 'Deploy', '-t', 'prod', '-r', 'v1.2'],
        fixture.config,
      )

      expect(result.error).to.equal(undefined)
      expect(fixture.calls).to.have.lengthOf(1)
      expect(JSON.parse(fixture.calls[0].body!)).to.not.have.property('reviewer_ids')
    })

    it('reports a clear error when asking reviewers fails after the request was created (AC5)', async () => {
      fixture.route((url) =>
        url.pathname.endsWith('/review_request')
          ? json({message: 'At least one user must be asked to review.'}, 400)
          : json(created),
      )

      const result = await runCommand(
        ['tenant_deploy_request', 'create', 'Deploy', '-t', 'prod', '-r', 'v1.2', '--reviewers', '45'],
        fixture.config,
      )

      expect(oneLine(result.error?.message ?? '')).to.contain(
        'Created deploy request #12, but failed to ask reviewers: At least one user must be asked to review.',
      )
    })

    it('rejects a non-numeric reviewer id before creating anything', async () => {
      fixture.route(() => json(created))

      const result = await runCommand(
        ['tenant_deploy_request', 'create', 'Deploy', '-t', 'prod', '-r', 'v1.2', '--reviewers', '12,abc'],
        fixture.config,
      )

      expect(oneLine(result.error?.message ?? '')).to.contain('Invalid --reviewers value "abc"')
      expect(fixture.calls).to.have.lengthOf(0)
    })
  })

  describe('edit', () => {
    const current = {description: 'old desc', id: 12, status: 'pending', title: 'Old title'}

    it('asks the named user without reading a nonexistent current.reviewers and without a PUT (AC3)', async () => {
      fixture.route((url) =>
        url.pathname.endsWith('/review_request') ? json([{id: 1, target: {id: 45}}]) : json(current),
      )

      const result = await runCommand(['tenant_deploy_request', 'edit', '12', '--reviewers', '45'], fixture.config)

      expect(result.error).to.equal(undefined)
      // GET then review_request — no PUT when only reviewers change (so no spurious update).
      expect(methods(fixture)).to.deep.equal(['GET', 'POST'])
      expect(fixture.calls[1].url.pathname).to.equal('/api:meta/workspace/1/approval_request/12/review_request')
      expect(JSON.parse(fixture.calls[1].body!)).to.deep.equal({targets: [45]})
      expect(result.stdout).to.contain('Asked 1 user(s) to review deploy request #12')
    })

    it('edits title/description with no review_request and no reviewer_ids when --reviewers is absent (AC4)', async () => {
      fixture.route((_url, method) => (method === 'PUT' ? json({...current, title: 'Redeploy'}) : json(current)))

      const result = await runCommand(['tenant_deploy_request', 'edit', '12', '--title', 'Redeploy'], fixture.config)

      expect(result.error).to.equal(undefined)
      expect(methods(fixture)).to.deep.equal(['GET', 'PUT'])
      const putBody = JSON.parse(fixture.calls[1].body!)
      // Title changes; description is preserved from the GET (not reset to '').
      expect(putBody).to.deep.equal({description: 'old desc', title: 'Redeploy'})
      expect(putBody).to.not.have.property('reviewer_ids')
      expect(fixture.calls.some((c) => c.url.pathname.endsWith('/review_request'))).to.equal(false)
      expect(result.stdout).to.contain('Updated deploy request #12')
    })

    it('both edits wording and asks reviewers: PUT then review_request', async () => {
      fixture.route((url, method) =>
        url.pathname.endsWith('/review_request')
          ? json([{id: 1, target: {id: 45}}])
          : method === 'PUT'
            ? json({...current, title: 'Redeploy'})
            : json(current),
      )

      const result = await runCommand(
        ['tenant_deploy_request', 'edit', '12', '--title', 'Redeploy', '--reviewers', '45'],
        fixture.config,
      )

      expect(result.error).to.equal(undefined)
      expect(methods(fixture)).to.deep.equal(['GET', 'PUT', 'POST'])
      expect(JSON.parse(fixture.calls[2].body!)).to.deep.equal({targets: [45]})
      expect(result.stdout).to.contain('Updated deploy request #12')
      expect(result.stdout).to.contain('Asked 1 user(s)')
    })

    it('errors when neither wording nor reviewers are given, touching nothing', async () => {
      fixture.route(() => json(current))

      const result = await runCommand(['tenant_deploy_request', 'edit', '12'], fixture.config)

      expect(oneLine(result.error?.message ?? '')).to.contain('Nothing to edit')
      expect(fixture.calls).to.have.lengthOf(0)
    })

    it('reports a clear error when asking reviewers fails after the edit (AC5)', async () => {
      fixture.route((url, method) =>
        url.pathname.endsWith('/review_request')
          ? json({message: 'Please upgrade to access this feature.'}, 403)
          : method === 'PUT'
            ? json({...current, title: 'Redeploy'})
            : json(current),
      )

      const result = await runCommand(
        ['tenant_deploy_request', 'edit', '12', '--title', 'Redeploy', '--reviewers', '45'],
        fixture.config,
      )

      expect(oneLine(result.error?.message ?? '')).to.contain(
        'Edited deploy request #12, but failed to ask reviewers: Please upgrade to access this feature.',
      )
    })
  })
})
