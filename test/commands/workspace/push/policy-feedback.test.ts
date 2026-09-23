import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import {syncBuiltinESMExports} from 'node:module'
import path from 'node:path'
import readline from 'node:readline'

import {json, policyFixture} from '../../../helpers/policy-fixture.js'

const finding = {id: 'F1', message: 'No auth', object: {name: 'GET /x', type: 'query'}, policy_key: 'AUTH-001', rule_id: 'AUTH-001.R1'}
const warned = ['disabled', 'forbidden', 'unavailable', 'error']

describe('workspace push policy feedback', () => {
  const fixture = policyFixture()
  const push = (...extra: string[]) =>
    runCommand(['workspace', 'push', '-d', fixture.directory, '--force', '--no-guids', ...extra], fixture.config)

  // [label, policy_check, exit code, the one warning line, a line the summary prints]
  const cases: Array<[string, Record<string, unknown> | undefined, number, null | string, null | string]> = [
    ['a pass', {blocking: false, message: 'No policy findings.', results: [], status: 'pass'}, 0, null, 'Policy check: pass\nNo policy findings.'],
    ['advisory findings', {blocking: false, findings: [finding], status: 'fail'}, 0, null, 'Policy check: advisory findings (not blocking)'],
    ['blocking findings', {blocking: true, blocking_findings: [finding], findings: [finding], message: 'Active policies reported findings.', status: 'fail'}, 2, null,
      'Policy check: fail (blocking findings)\nActive policies reported findings.'],
    ['no active policy', {blocking: false, message: 'No active policies on this branch.', status: 'not_applicable'}, 0, null,
      'Policy check: not_applicable\nNo active policies on this branch.'],
    ...warned.map((status): [string, Record<string, unknown>, number, string, null] =>
      [status, {blocking: false, message: `The server says ${status}.`, status}, 0, `Policy check ${status}: The server says ${status}.`, null]),
    ['blocking findings beside an errored check', {blocking: true, blocking_findings: [finding], findings: [finding], message: 'A check could not run.', status: 'error'}, 2,
      'Policy check error: A check could not run.', 'Blocking findings (1)'],
    ['an unknown status', {blocking: false, message: 'Something new.', status: 'partial'}, 0, 'Policy check partial: Something new.', null],
    ['no feedback', undefined, 0, 'Policy check: no policy feedback returned.', null],
  ]
  for (const [label, check, code, warning, printed] of cases) {
    it(`exits ${code} for ${label}${warning ? ', with one warning line' : ''}`, async () => {
      fixture.route(() => json({guid_map: [], ...(check ? {policy_check: check} : {})}))
      const result = await push()
      expect(result.error).to.equal(undefined)
      expect(process.exitCode ?? 0).to.equal(code)
      const warnings = result.stderr.split('\n').filter((line) => line.includes('Policy check'))
      if (warning) expect(warnings).to.have.length(1).and.to.satisfy((lines: string[]) => lines[0].includes(warning))
      else expect(warnings).to.deep.equal([])
      if (printed) expect(result.stdout).to.contain(printed)
      if (warning) expect(result.stdout).not.to.contain('Policy check:')
    })
  }

  it('prints the rule errors of an errored evaluation after its warning line', async () => {
    const results = [{check_id: 'AUTH-001.R1', checked: 0, message: 'unknown check query.removed', policy_key: 'AUTH-001', status: 'error'}]
    fixture.route(() => json({guid_map: [], policy_check: {blocking: false, message: 'A check could not run.', results, status: 'error'}}))
    const result = await push()
    expect(result.stderr).to.contain('Policy check error: A check could not run.')
    expect(result.stdout).to.contain('Errors:\n  AUTH-001 AUTH-001.R1: unknown check query.removed')
    expect(result.stdout).not.to.contain('Policy check:')
    expect(process.exitCode ?? 0).to.equal(0)
  })

  it('keeps stdout a single JSON document and still warns on stderr', async () => {
    const check = {blocking: false, message: 'This credential cannot read policies.', status: 'forbidden'}
    fixture.route(() => json({guid_map: [], policy_check: check}))
    const result = await push('-o', 'json')
    expect(JSON.parse(result.stdout).policy_check).to.deep.equal(check)
    expect(result.stderr).to.contain('Policy check forbidden: This credential cannot read policies.')
    expect(process.exitCode ?? 0).to.equal(0)
  })

  it('rejects --allow_missing_policy_check as an unknown flag', async () => {
    fixture.route(() => json({guid_map: []}))
    const result = await push('--allow_missing_policy_check')
    expect(result.error?.message).to.contain('Nonexistent flag')
    expect(fixture.calls).to.have.length(0)
  })

  for (const message of ['Tightened the auth policies', undefined]) {
    it(`${message ? 'sends' : 'omits'} message= on the import for -m ${JSON.stringify(message)}`, async () => {
      fixture.route(() => json({guid_map: [], policy_check: {blocking: false, status: 'pass'}}))
      await push(...(message ? ['-m', `"${message}"`] : []))
      expect(fixture.calls).to.have.length(1)
      expect(fixture.calls[0].url.pathname).to.match(/\/multidoc$/)
      expect(fixture.calls[0].url.searchParams.get('message')).to.equal(message ?? null)
    })
  }

  it('sends no message= for an -m that is only whitespace', async () => {
    fixture.route(() => json({guid_map: [], policy_check: {blocking: false, status: 'pass'}}))
    await push('-m', '"   "')
    expect(fixture.calls[0].url.searchParams.has('message')).to.equal(false)
  })

  it('never sends -m with the preview', async () => {
    fixture.route(() => json({
      operations: [{action: 'update', details: '', name: 'AUTH-001', type: 'policy'}],
      summary: {policy: {created: 0, deleted: 0, truncated: 0, unchanged: 0, updated: 1}},
    }))
    const result = await runCommand(['workspace', 'push', '-d', fixture.directory, '--dry-run', '-m', 'Label'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(fixture.calls.map((call) => call.url.pathname)).to.deep.equal(['/api:meta/workspace/1/multidoc/dry-run'])
    expect(fixture.calls[0].url.searchParams.has('message')).to.equal(false)
  })

  it('exits 1 for a failed import, with the failure as JSON under -o json', async () => {
    fixture.route(() => json({message: 'Invalid block: enforcement', payload: {param: 'source'}}, 500))
    const result = await push('-o', 'json')
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.error?.message).to.equal('Push failed (500): Invalid block: enforcement\n  Parameter: source')
    expect(JSON.parse(result.stdout)).to.deep.equal({error: {exit: 1, message: result.error?.message}})
  })

  it('exits 1 for a refused flag combination', async () => {
    fixture.route(() => json({}))
    const result = await push('--delete')
    expect(result.error).to.have.nested.property('oclif.exit', 1)
    expect(result.error?.message).to.contain('Cannot use --delete without --sync')
    expect(fixture.calls).to.have.length(0)
  })

  it('prints one JSON document for a dry-run, with the preview rendering on stderr', async () => {
    const preview = {
      operations: [{action: 'update', details: '', name: 'AUTH-001', type: 'policy'}],
      summary: {policy: {created: 0, deleted: 0, truncated: 0, unchanged: 0, updated: 1}},
    }
    fixture.route(() => json(preview))
    const result = await runCommand(['workspace', 'push', '-d', fixture.directory, '--dry-run', '-o', 'json'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout)).to.deep.equal({imported: false, preview, reason: 'dry-run'})
    expect(result.stderr).to.contain('AUTH-001')
  })

  it('prints one JSON document when the preview finds nothing to push', async () => {
    const preview = {
      operations: [{action: 'unchanged', details: '', name: 'AUTH-001', type: 'policy'}],
      summary: {policy: {created: 0, deleted: 0, truncated: 0, unchanged: 1, updated: 0}},
    }
    fixture.route(() => json(preview))
    const result = await runCommand(['workspace', 'push', '-d', fixture.directory, '-o', 'json'], fixture.config)
    expect(result.error).to.equal(undefined)
    expect(JSON.parse(result.stdout)).to.deep.equal({imported: false, preview, reason: 'no-changes'})
    expect(result.stderr).to.contain('No changes to push.')
  })

  describe('a knowledge sync that fails after the import', () => {
    const blocking = {blocking: true, blocking_findings: [finding], findings: [finding], message: 'Active policies reported findings.', status: 'fail'}
    let tree: string

    beforeEach(() => {
      tree = fs.mkdtempSync(path.join(fixture.directory, 'imported-'))
      fs.writeFileSync(path.join(tree, 'AUTH-001.xs'), 'policy AUTH-001 {\n title = "Auth"\n}')
      fs.mkdirSync(path.join(tree, 'knowledge', 'docs'), {recursive: true})
      fs.writeFileSync(path.join(tree, 'knowledge', 'docs', 'notes.md'), '---\nname: notes\n---\n\nChanged notes.\n')
    })

    const pushTree = (check: Record<string, unknown>, ...extra: string[]) => {
      fixture.route((url) => url.pathname.endsWith('/knowledge/sync')
        ? json({message: 'Knowledge store unavailable'}, 500)
        : json({guid_map: [], policy_check: check}))
      return runCommand(['workspace', 'push', '-d', tree, '--force', '--no-guids', ...extra], fixture.config)
    }

    it('still prints a blocking finding, then the failure, and exits 2', async () => {
      const result = await pushTree(blocking)
      expect(fixture.calls.map((call) => call.url.pathname)).to.deep.equal(['/api:meta/workspace/1/multidoc', '/api:meta/workspace/1/knowledge/sync'])
      expect(result.stdout).to.contain('Policy check: fail (blocking findings)').and.to.contain('AUTH-001')
      expect(result.error?.message).to.contain('Failed to push knowledge').and.to.contain('Knowledge store unavailable')
      expect(result.error).to.have.nested.property('oclif.exit', 2)
    })

    it('prints the policy check and exits 1 when nothing blocks', async () => {
      const result = await pushTree({blocking: false, message: 'No policy findings.', results: [], status: 'pass'})
      expect(result.stdout).to.contain('Policy check: pass\nNo policy findings.')
      expect(result.error?.message).to.contain('Failed to push knowledge')
      expect(result.error).to.have.nested.property('oclif.exit', 1)
    })

    it('keeps the policy check in the one JSON document, beside the failure', async () => {
      const result = await pushTree(blocking, '-o', 'json')
      const document = JSON.parse(result.stdout)
      expect(document).to.deep.include({imported: true, policy_check: blocking})
      expect(document.error).to.deep.equal({exit: 2, message: result.error?.message})
      expect(result.error).to.have.nested.property('oclif.exit', 2)
    })
  })

  describe('a push that sends only knowledge', () => {
    const originalInterface = readline.createInterface
    const originalTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
    let tree: string

    beforeEach(() => {
      tree = fs.mkdtempSync(path.join(fixture.directory, 'tree-'))
      fs.writeFileSync(path.join(tree, 'AUTH-001.xs'), 'policy AUTH-001 {\n title = "Auth"\n}')
      fs.mkdirSync(path.join(tree, 'knowledge', 'docs'), {recursive: true})
      fs.writeFileSync(path.join(tree, 'knowledge', 'docs', 'notes.md'), '---\nname: notes\n---\n\nChanged notes.\n')
      Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: true})
      readline.createInterface = (() => ({
        close() {},
        on() {},
        question(_message: string, answer: (value: string) => void) {
          answer('yes')
        },
      })) as unknown as typeof readline.createInterface
      syncBuiltinESMExports()
    })

    afterEach(() => {
      readline.createInterface = originalInterface
      syncBuiltinESMExports()
      if (originalTTY) Object.defineProperty(process.stdin, 'isTTY', originalTTY)
      else Reflect.deleteProperty(process.stdin, 'isTTY')
    })

    it('reports no policy feedback when the preview left no document to send', async () => {
      fixture.route((url, _method, body) => {
        if (url.pathname.endsWith('/multidoc/dry-run')) {
          return json({
            operations: [{action: 'unchanged', details: '', name: 'AUTH-001', type: 'policy'}],
            summary: {policy: {created: 0, deleted: 0, truncated: 0, unchanged: 1, updated: 0}},
          })
        }

        if (url.pathname.endsWith('/knowledge/sync') && body?.includes('"dry_run":true')) {
          return json({operations: [{action: 'create', name: 'notes', type: 'doc'}], summary: {doc: {created: 1, deleted: 0, unchanged: 0, updated: 0}}})
        }

        if (url.pathname.endsWith('/knowledge/sync')) return json({imported: 1})
        throw new Error(`unexpected request ${url.pathname}`)
      })
      const result = await runCommand(['workspace', 'push', '-d', tree, '--no-guids'], fixture.config)
      expect(result.error).to.equal(undefined)
      expect(result.stdout).to.contain('1 knowledge file')
      expect(`${result.stdout}${result.stderr}`).not.to.contain('Policy check')
      expect(fixture.calls.some((call) => call.url.pathname.endsWith('/multidoc'))).to.equal(false)
      expect(process.exitCode ?? 0).to.equal(0)
    })
  })
})
