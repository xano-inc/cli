import {Config} from '@oclif/core'
import {expect} from 'chai'
import * as fs from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import Pull from '../../../../src/commands/workspace/pull/index.js'

const policy = (key: string) => `policy ${key} {\n title = "${key}"\n}`
/** What the writer puts on disk: the document's own bytes, newline-terminated. */
const onDisk = (key: string) => `${policy(key)}\n`

describe('workspace pull policy files', () => {
  let directory: string
  let command: Pull
  let source: string
  let warnings: string[]

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(tmpdir(), 'xano-pull-policy-'))
    warnings = []
    command = Object.assign(new Pull([], {} as Config), {
      log() {},
      parse: async () => ({flags: {directory, draft: false, env: false, records: false}}),
      resolveProfile: () => ({profile: {access_token: 'test', instance_origin: 'https://test.example', workspace: '1'}}),
      verboseFetch: async (url: string) => new Response(url.endsWith('/knowledge/sync') ? '[]' : source),
      warn: (message: string) => warnings.push(message),
    })
  })

  afterEach(() => fs.rmSync(directory, {force: true, recursive: true}))

  it('rejects case-colliding targets before writing any documents', async () => {
    source = ['function first {\n}', policy('AUTH-001'), policy('auth-001')].join('\n---\n')
    let error: Error | undefined
    try {
      await command.run()
    } catch (error_) {
      error = error_ as Error
    }

    expect(error?.message).to.contain('Policy filename collision')
    expect(error?.message).to.contain('AUTH-001.xs')
    expect(error?.message).to.contain('auth-001.xs')
    expect(fs.readdirSync(directory)).to.deep.equal([])
  })

  it('preserves an existing local policy when an export changes only the key case', async () => {
    source = policy('AUTH-001')
    await command.run()
    source = policy('auth-001')
    let error: Error | undefined
    try {
      await command.run()
    } catch (error_) {
      error = error_ as Error
    }

    expect(error?.message).to.contain('Policy filename collision')
    expect(fs.readdirSync(path.join(directory, 'policies'))).to.deep.equal(['AUTH-001.xs'])
    expect(fs.readFileSync(path.join(directory, 'policies', 'AUTH-001.xs'), 'utf8')).to.equal(onDisk('AUTH-001'))
  })

  it('terminates policy source without changing other document types', async () => {
    const ordinary = ['table plan {\n}', 'function price_usage {\n}', 'workspace meterworks {\n}']
    source = [policy('SEC-100'), ...ordinary].join('\n---\n')
    await command.run()
    expect(fs.readFileSync(path.join(directory, 'policies/SEC-100.xs'), 'utf8')).to.equal(onDisk('SEC-100'))
    for (const [index, relative] of ['table/plan.xs', 'function/price_usage.xs', 'workspace/meterworks.xs'].entries()) {
      expect(fs.readFileSync(path.join(directory, relative), 'utf8')).to.equal(ordinary[index])
    }
  })

  it('leaves a document that already ends in a newline exactly as it is', async () => {
    source = `${policy('SEC-100')}\n`
    await command.run()
    expect(fs.readFileSync(path.join(directory, 'policies', 'SEC-100.xs'), 'utf8')).to.equal(onDisk('SEC-100'))
  })

  for (const remaining of [[policy('KEEP'), policy('NEW')], ['function first {\n}'], []]) {
    it(`warns about stale files and preserves them when ${remaining.length} documents remain`, async () => {
      source = [policy('OLD'), policy('KEEP')].join('\n---\n')
      await command.run()
      expect(warnings).to.deep.equal([])
      fs.writeFileSync(path.join(directory, 'policies', 'README.md'), 'Local notes')
      source = remaining.join('\n---\n')
      await command.run()
      expect(warnings.join('\n')).to.contain('Stale local policy files')
      expect(warnings.join('\n')).to.contain('policies/OLD.xs')
      expect(warnings.join('\n')).not.to.contain('README.md')
      if (remaining.length === 2) expect(warnings.join('\n')).not.to.contain('policies/KEEP.xs')
      else expect(warnings.join('\n')).to.contain('policies/KEEP.xs')
      expect(fs.readFileSync(path.join(directory, 'policies', 'OLD.xs'), 'utf8')).to.equal(onDisk('OLD'))
      expect(fs.readFileSync(path.join(directory, 'policies', 'KEEP.xs'), 'utf8')).to.equal(onDisk('KEEP'))
    })
  }
})
