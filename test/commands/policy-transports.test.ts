import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import path from 'node:path'

import {json, policyFixture} from '../helpers/policy-fixture.js'

/** A warning as one line: oclif wraps it at the terminal width behind a ` › ` gutter. */
const warned = (stderr: string) => stderr.replaceAll(/\s*›\s*/g, ' ').replaceAll(/\s+/g, ' ').trim()

/** A dry run's answer: one function to update, plus `extra`. */
const preview = (extra: Record<string, unknown> = {}) => ({
  operations: [{action: 'update', details: 'XS content differs', name: 'helper', type: 'function'}],
  summary: {function: {created: 0, deleted: 0, truncated: 0, unchanged: 0, updated: 1}},
  ...extra,
})

/**
 * Tier1 tenant, ephemeral and sandbox pushes carry policies. A remote tenant push, a tenant without a
 * policy table and any import while the feature is off leave them out; their `policies_skipped`
 * notice is printed once. Releases carry them; a release push by a caller who may not author
 * policies carries the live branch's instead, and the notice names the files it left out.
 */
describe('which pushes carry policy files', () => {
  const fixture = policyFixture()
  const skipped = {
    keys: ['AUTH-001'],
    message: '1 policy file was left out (AUTH-001): a remote tenant does not accept policy files yet; a release deployed to it carries them.',
  }
  const helper = 'function helper {\n  input {\n  }\n\n  stack {\n  }\n\n  response = null\n}'
  const policy = 'policy "AUTH-001" {\n  title = "Auth"\n}'
  let tree: string
  let policiesOnly: string

  before(() => {
    tree = path.join(fixture.directory, 'tree')
    fs.mkdirSync(path.join(tree, 'policies'), {recursive: true})
    fs.writeFileSync(path.join(tree, 'helper.xs'), helper)
    fs.writeFileSync(path.join(tree, 'policies', 'AUTH-001.xs'), policy)
    policiesOnly = path.join(fixture.directory, 'policies-only')
    fs.mkdirSync(policiesOnly)
    fs.writeFileSync(path.join(policiesOnly, 'AUTH-001.xs'), policy)
  })

  /** Every multidoc route answers `answer`; the knowledge list is empty. */
  function answer(body: Record<string, unknown>): void {
    fixture.route(url => url.pathname.endsWith('/knowledge/sync') ? json([]) : json(body))
  }

  for (const [name, args] of [['sandbox push', ['sandbox', 'push']], ['ephemeral push', ['ephemeral', 'push', 'demo']]] as const) {
    it(`${name} prints the platform's notice when it left policy files out`, async () => {
      answer({guid_map: [], policies_skipped: skipped})
      const result = await runCommand([...args, '-d', tree, '--force'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls.some(call => call.method === 'POST' && call.url.pathname.endsWith('/multidoc'))).to.equal(true)
      expect(warned(result.stderr)).to.contain(skipped.message)
    })

    it(`${name} --dry-run prints the preview's notice`, async () => {
      answer(preview({policies_skipped: skipped}))
      const result = await runCommand([...args, '-d', tree, '--dry-run'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls.every(call => !call.url.pathname.endsWith('/multidoc'))).to.equal(true)
      expect(warned(result.stderr)).to.contain(skipped.message)
    })

    it(`${name} says nothing about policies when it left none out`, async () => {
      answer({guid_map: []})
      const result = await runCommand([...args, '-d', tree, '--force'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(result.stderr).not.to.contain('policy file')
    })
  }

  it('release push carries its policy files and names them', async () => {
    fixture.route(() => json({id: 10, name: 'v1'}))
    const result = await runCommand(['release', 'push', '-n', 'v1', '-d', tree], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls).to.have.length(1)
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/release/multidoc')
    expect(fixture.calls[0].body).to.contain('function helper').and.to.contain('policy "AUTH-001"')
    expect(result.stderr).not.to.contain('policy file')
    expect(result.stdout).to.contain('Documents: 2').and.to.contain('Policy documents: 1 (AUTH-001)')
  })

  it('release push of policy files alone sends them as the release', async () => {
    fixture.route(() => json({id: 11, name: 'v1'}))
    const result = await runCommand(['release', 'push', '-n', 'v1', '-d', policiesOnly], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls).to.have.length(1)
    expect(fixture.calls[0].body).to.equal(policy)
  })

  it('release push prints the notice of a platform that left its policy files out', async () => {
    const featureOff = {keys: ['AUTH-001'], message: '1 policy file was left out (AUTH-001): Policies are not enabled on this instance.'}
    fixture.route(() => json({id: 12, name: 'v1', policies_skipped: featureOff}))
    const result = await runCommand(['release', 'push', '-n', 'v1', '-d', tree], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(warned(result.stderr)).to.contain(featureOff.message)
    expect(result.stdout).not.to.contain('Policy documents')
  })

  it('release push by a caller who may not author policies warns that the release carries the live branch\'s', async () => {
    const liveInstead = {
      keys: ['AUTH-001'],
      message: '1 policy file was left out (AUTH-001): the credential that created this release has no workspace:policy create and update permission, so the release carries the workspace\'s live-branch policies instead of these files.',
    }
    fixture.route(() => json({id: 13, name: 'v1', policies_skipped: liveInstead}))
    const result = await runCommand(['release', 'push', '-n', 'v1', '-d', tree], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls[0].body).to.contain('policy "AUTH-001"')
    expect(warned(result.stderr)).to.contain(liveInstead.message)
    expect(result.stdout).to.contain('Created release: v1').and.not.to.contain('Policy documents')
  })

  /**
   * A workspace push sends its policy files; an instance with the Policies feature off leaves them out
   * and says so once in `policies_skipped`, which replaces the count of what was sent.
   */
  describe('workspace push while the Policies feature is off', () => {
    const featureOff = {
      keys: ['AUTH-001'],
      message: '1 policy file was left out (AUTH-001): Policies are not enabled on this instance, so imports leave policies out and keep the workspace\'s own policies as they are.',
    }
    const disabled = {blocking: false, message: 'Policies are not enabled on this instance; nothing was evaluated.', status: 'disabled'}

    it('prints the platform\'s notice instead of the policy documents it sent', async () => {
      answer({guid_map: [], policies_skipped: featureOff, policy_check: disabled})
      const result = await runCommand(['workspace', 'push', '-d', tree, '--force', '--no-guids'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls.find(call => call.url.pathname.endsWith('/multidoc'))?.body).to.contain('policy "AUTH-001"')
      expect(warned(result.stderr)).to.contain(featureOff.message)
      expect(result.stdout).not.to.contain('Policy documents')
      expect(warned(result.stderr)).to.contain(`Policy check disabled: ${disabled.message}`)
    })

    it('still counts the policy documents it sent when the platform left none out', async () => {
      answer({guid_map: [], policy_check: disabled})
      const result = await runCommand(['workspace', 'push', '-d', tree, '--force', '--no-guids'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(result.stdout).to.contain('Policy documents: 1 sent without a preview')
      expect(result.stderr).not.to.contain('policy file')
    })

    it('prints the preview\'s notice for a dry run', async () => {
      answer(preview({policies_skipped: featureOff}))
      const result = await runCommand(['workspace', 'push', '-d', tree, '--dry-run'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(fixture.calls.every(call => !call.url.pathname.endsWith('/multidoc'))).to.equal(true)
      expect(warned(result.stderr)).to.contain(featureOff.message)
    })

    it('prints the preview\'s notice when only policy files changed and nothing is pushed', async () => {
      answer({operations: [], policies_skipped: featureOff, summary: {}})
      const result = await runCommand(['workspace', 'push', '-d', tree], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(result.stdout).to.contain('No changes to push.')
      expect(warned(result.stderr)).to.contain(featureOff.message)
    })

    it('keeps the notice in the one JSON document', async () => {
      answer({guid_map: [], policies_skipped: featureOff, policy_check: disabled})
      const result = await runCommand(['workspace', 'push', '-d', tree, '--force', '--no-guids', '-o', 'json'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(JSON.parse(result.stdout).policies_skipped).to.deep.equal(featureOff)
      expect(warned(result.stderr)).to.contain(featureOff.message)
    })
  })
})
