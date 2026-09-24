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
 * Tenants, sandboxes and releases carry no policies: policies stay in their workspace. A tenant or
 * sandbox push leaves policy files out and names them once in `policies_skipped`; a release built
 * from local files never sends them.
 */
describe('pushes that carry no policies', () => {
  const fixture = policyFixture()
  const skipped = {
    keys: ['AUTH-001'],
    message: '1 policy file was left out (AUTH-001): policies stay in their workspace, and tenants, sandboxes and releases carry none.',
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

  it('release push leaves policy files out, says so, and counts only what it sent', async () => {
    fixture.route(() => json({id: 10, name: 'v1'}))
    const result = await runCommand(['release', 'push', '-n', 'v1', '-d', tree], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls).to.have.length(1)
    expect(fixture.calls[0].url.pathname).to.equal('/api:meta/workspace/1/release/multidoc')
    expect(fixture.calls[0].body).to.contain('function helper').and.not.to.contain('policy "AUTH-001"')
    expect(warned(result.stderr)).to.contain(skipped.message)
    expect(result.stdout).to.contain('Documents: 1')
  })

  it('release push of policy files alone sends nothing', async () => {
    fixture.route(() => { throw new Error('unexpected request') })
    const result = await runCommand(['release', 'push', '-n', 'v1', '-d', policiesOnly], fixture.config)
    expect(result.error?.message).to.contain('No documents other than policies in')
    expect(fixture.calls).to.have.length(0)
  })
})
