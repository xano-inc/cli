import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import path from 'node:path'

import {serverReferenceWarnings} from '../../../../src/utils/multidoc-push.js'
import {json, policyFixture} from '../../../helpers/policy-fixture.js'

/** The platform's dry-run warning for a table a pushed document names that exists nowhere. */
const missingTable = (name: string, table: string) => ({
  message: `references table "${table}", which does not exist; the push will fail until it is created or the reference removed`,
  name,
  target: table,
  target_type: 'table',
  type: 'function',
})

/** The Unresolved References section of a push preview, or '' when it printed none. */
const section = (stdout: string) => {
  const from = stdout.indexOf('=== Unresolved References ===')
  if (from === -1) return ''
  const rest = stdout.slice(from)
  const end = rest.indexOf('\n\n', rest.indexOf('\n  WARNING'))
  return end === -1 ? rest : rest.slice(0, end)
}

/**
 * A push preview lists, under Unresolved References, the platform's dry-run warnings that name what
 * they point at, beside the references the CLI finds itself, each once.
 */
describe('the push preview lists the platform\'s unresolved references', () => {
  const fixture = policyFixture()
  let tree: string

  before(() => {
    tree = path.join(fixture.directory, 'refs')
    fs.mkdirSync(tree, {recursive: true})
    fs.writeFileSync(
      path.join(tree, 'helper.xs'),
      'function helper {\n  input {\n  }\n\n  stack {\n    db.query ghost {\n      return = {type: "list"}\n    } as $rows\n\n    db.query audit {\n      return = {type: "list"}\n    } as $logs\n  }\n\n  response = $rows\n}',
    )
  })

  /** The dry run's answer: the function changes, the workspace holds table audit, and `extra`. */
  function answer(extra: Record<string, unknown>): void {
    fixture.route(url => url.pathname.endsWith('/knowledge/sync') ? json([]) : json({
      operations: [
        {action: 'update', details: 'XS content differs', name: 'helper', type: 'function'},
        {action: 'unchanged', details: '', name: 'audit', type: 'table'},
      ],
      summary: {function: {created: 0, deleted: 0, truncated: 0, unchanged: 0, updated: 1}},
      ...extra,
    }))
  }

  for (const [name, args] of [['workspace push', ['workspace', 'push']], ['sandbox push', ['sandbox', 'push']], ['ephemeral push', ['ephemeral', 'push', 'demo']]] as const) {
    it(`${name} --dry-run shows a table the platform says exists nowhere, and one the CLI found only once`, async () => {
      // ghost: the CLI finds it too. audit: the workspace holds it, so only the platform can tell (a delete push drops it).
      answer({warnings: [missingTable('helper', 'ghost'), missingTable('helper', 'audit'), {message: 'an unrelated note', name: 'srv', type: 'mcp_server'}]})
      const result = await runCommand([...args, '-d', tree, '--dry-run'], fixture.config)
      expect(result.error).to.equal(undefined)
      const listed = section(result.stdout)
      expect(listed).to.contain('A missing table fails the push')
      expect(listed.match(/ghost/g)).to.have.length(1)
      expect(listed).to.contain('db.* → table "ghost" does not exist')
      expect(listed).to.contain('references table "audit", which does not exist; the push will fail until it is created or the reference removed')
      expect(listed).not.to.contain('an unrelated note')
    })
  }

  it('renders the CLI\'s own list when an older platform sends no warnings', async () => {
    answer({})
    const result = await runCommand(['workspace', 'push', '-d', tree, '--dry-run'], fixture.config)
    expect(result.error).to.equal(undefined)
    const listed = section(result.stdout)
    expect(listed).to.contain('db.* → table "ghost" does not exist')
    expect(listed).not.to.contain('audit')
  })

  describe('serverReferenceWarnings', () => {
    const ref = {source: 'helper', sourceType: 'function', statementType: 'db.*', target: 'ghost', targetType: 'table'}

    it('keeps reference warnings the client did not list, each once, and drops anything malformed or untargeted', () => {
      const audit = missingTable('helper', 'audit')
      expect(serverReferenceWarnings([missingTable('helper', 'ghost'), audit, audit, {message: 'x', name: 'srv', type: 'mcp_server'}, null, 'text', {...audit, target: ''}], [ref]))
        .to.deep.equal([audit])
      // The same target from another document is its own reference.
      expect(serverReferenceWarnings([missingTable('other', 'ghost')], [ref])).to.have.length(1)
    })

    it('is empty for an older platform that sends no warnings, or a body that is not a list', () => {
      for (const warnings of [undefined, null, {}, 'warnings']) expect(serverReferenceWarnings(warnings, [ref])).to.deep.equal([])
    })
  })
})
