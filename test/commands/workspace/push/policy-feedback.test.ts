import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import {syncBuiltinESMExports} from 'node:module'
import path from 'node:path'
import readline from 'node:readline'

import {json, policyFixture} from '../../../helpers/policy_fixture.js'

const finding = {id: 'F1', message: 'No auth', object: {name: 'GET /x', type: 'query'}, policy_key: 'AUTH-001', rule_id: 'AUTH-001.R1'}
const statuses = ['disabled', 'not_applicable', 'forbidden', 'unavailable', 'error']

describe('workspace push policy feedback', () => {
  const fixture = policyFixture()
  const push = (...extra: string[]) =>
    runCommand(['workspace', 'push', '-d', fixture.directory, '--force', '--no-guids', ...extra], fixture.config)

  const cases: Array<[string, Record<string, unknown> | undefined, number, null | string]> = [
    ['a pass', {blocking: false, results: [], status: 'pass'}, 0, null],
    ['advisory findings', {blocking: false, findings: [finding], status: 'fail'}, 0, null],
    ['blocking findings', {blocking: true, blocking_findings: [finding], findings: [finding], status: 'fail'}, 2, null],
    ...statuses.map((status): [string, Record<string, unknown>, number, string] =>
      [status, {blocking: false, message: `The server says ${status}.`, status}, 0, `Policy check ${status}: The server says ${status}.`]),
    ['no feedback', undefined, 0, 'Policy check: no policy feedback returned.'],
  ]
  for (const [label, check, code, warning] of cases) {
    it(`exits ${code} for ${label}${warning ? ', with one warning line' : ''}`, async () => {
      fixture.route(() => json({guid_map: [], ...(check ? {policy_check: check} : {})}))
      const result = await push()
      expect(result.error).to.equal(undefined)
      expect(process.exitCode ?? 0).to.equal(code)
      const warnings = result.stderr.split('\n').filter((line) => line.includes('Policy check'))
      if (warning) expect(warnings).to.have.length(1).and.to.satisfy((lines: string[]) => lines[0].includes(warning))
      else expect(warnings).to.deep.equal([])
      expect(`${result.stdout}${result.stderr}`).not.to.contain('usable status')
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
    const check = {blocking: false, message: 'No active policies on this branch.', status: 'not_applicable'}
    fixture.route(() => json({guid_map: [], policy_check: check}))
    const result = await push('-o', 'json')
    expect(JSON.parse(result.stdout).policy_check).to.deep.equal(check)
    expect(result.stderr).to.contain('Policy check not_applicable: No active policies on this branch.')
    expect(process.exitCode ?? 0).to.equal(0)
  })

  it('no longer accepts --allow_missing_policy_check', async () => {
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
