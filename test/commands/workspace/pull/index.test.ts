import {Config} from '@oclif/core'
import {expect} from 'chai'
import * as fs from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

import Pull from '../../../../src/commands/workspace/pull/index.js'

const policy = (key: string) => `policy ${key} {\n title = "${key}"\n}`

describe('workspace pull policy files', () => {
  let directory: string
  let command: Pull
  let source: string
  let warnings: string[]
  let logs: string[]
  /** What the policy list route answers this credential. */
  let listing: () => Response
  let requested: URL[]

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(tmpdir(), 'xano-pull-policy-'))
    warnings = []
    logs = []
    listing = () => new Response(JSON.stringify({items: []}))
    requested = []
    command = Object.assign(new Pull([], {} as Config), {
      log: (message: string) => logs.push(message),
      parse: async () => ({flags: {directory, draft: false, env: false, records: false}}),
      resolveProfile: () => ({profile: {access_token: 'test', instance_origin: 'https://test.example', workspace: '1'}}),
      async verboseFetch(url: string) {
        requested.push(new URL(url))
        if (url.endsWith('/knowledge/sync')) return new Response('[]')
        return new URL(url).pathname.endsWith('/policy') ? listing() : new Response(source)
      },
      warn: (message: string) => warnings.push(message),
    })
  })

  afterEach(() => fs.rmSync(directory, {force: true, recursive: true}))

  it('leaves out policies whose keys differ only in case, and writes everything else', async () => {
    source = ['function first {\n}', policy('AUTH-001'), policy('auth-001'), policy('SEC-100')].join('\n---\n')
    await command.run()
    expect(warnings.join('\n')).to.contain('Policy files that differ only in case are left out of this pull')
      .and.to.contain('policies/AUTH-001.xs and policies/auth-001.xs')
    expect(fs.readdirSync(path.join(directory, 'policies'))).to.deep.equal(['SEC-100.xs'])
    expect(fs.readFileSync(path.join(directory, 'function', 'first.xs'), 'utf8')).to.equal('function first {\n}')
    expect(logs.join('\n')).to.contain('Pulled 2 documents')
  })

  it('keeps an existing local policy when an export changes only the key case, and pulls the rest', async () => {
    source = policy('AUTH-001')
    await command.run()
    source = [policy('auth-001'), 'function first {\n}'].join('\n---\n')
    await command.run()
    expect(warnings.join('\n')).to.contain('policies/auth-001.xs (local policies/AUTH-001.xs)')
    expect(warnings.join('\n')).not.to.contain('Stale local policy files')
    expect(fs.readdirSync(path.join(directory, 'policies'))).to.deep.equal(['AUTH-001.xs'])
    expect(fs.readFileSync(path.join(directory, 'policies', 'AUTH-001.xs'), 'utf8')).to.equal(policy('AUTH-001'))
    expect(fs.existsSync(path.join(directory, 'function', 'first.xs'))).to.equal(true)
  })

  it('writes policy source verbatim, exactly like every other document type', async () => {
    const ordinary = ['table plan {\n}', 'function price_usage {\n}', 'workspace meterworks {\n}']
    source = [policy('SEC-100'), ...ordinary].join('\n---\n')
    await command.run()
    expect(fs.readFileSync(path.join(directory, 'policies/SEC-100.xs'), 'utf8')).to.equal(policy('SEC-100'))
    for (const [index, relative] of ['table/plan.xs', 'function/price_usage.xs', 'workspace/meterworks.xs'].entries()) {
      expect(fs.readFileSync(path.join(directory, relative), 'utf8')).to.equal(ordinary[index])
    }
  })

  it('appends no newline to a policy whose export fragment ends in one', async () => {
    source = [`${policy('SEC-100')}\n`, 'function price_usage {\n}\n'].join('\n---\n')
    await command.run()
    expect(fs.readFileSync(path.join(directory, 'policies', 'SEC-100.xs'), 'utf8')).to.equal(policy('SEC-100'))
    expect(fs.readFileSync(path.join(directory, 'function', 'price_usage.xs'), 'utf8')).to.equal('function price_usage {\n}')
  })

  it('points at the skill that explains the policies it just wrote', async () => {
    source = [policy('SEC-100'), 'function price_usage {\n}'].join('\n---\n')
    await command.run()
    expect(logs.at(-2)).to.contain('Pulled 2 documents')
    expect(logs.at(-1)).to.equal('Run `xano skills pull` to install the policies skill for your coding agent.')
  })

  it('says nothing about the skill when the export carried no policy', async () => {
    source = ['function price_usage {\n}', 'table plan {\n}'].join('\n---\n')
    await command.run()
    expect(logs.join('\n')).to.contain('Pulled 2 documents')
    expect(logs.join('\n')).not.to.contain('xano skills pull')
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
      expect(fs.readFileSync(path.join(directory, 'policies', 'OLD.xs'), 'utf8')).to.equal(policy('OLD'))
      expect(fs.readFileSync(path.join(directory, 'policies', 'KEEP.xs'), 'utf8')).to.equal(policy('KEEP'))
      // An export that carries a policy already shows that this credential reads them.
      expect(requested.some(url => url.pathname.endsWith('/policy'))).to.equal(remaining.length !== 2)
    })
  }

  it('calls no local policy file stale when this credential cannot read policies, and keeps them all', async () => {
    source = [policy('OLD'), policy('KEEP')].join('\n---\n')
    await command.run()
    listing = () => new Response(JSON.stringify({message: 'No scope.', payload: {code: 'policy_scope_required', level: 'read'}}), {status: 403})
    source = 'function first {\n}'
    await command.run()
    expect(warnings).to.deep.equal([])
    expect(logs.filter(line => line.includes('policy files'))).to.deep.equal([
      "Local policy files were kept: this credential cannot list this workspace's policies, and the export carries none.",
    ])
    expect(fs.readdirSync(path.join(directory, 'policies'))).to.deep.equal(['KEEP.xs', 'OLD.xs'])
    expect(fs.existsSync(path.join(directory, 'function', 'first.xs'))).to.equal(true)
  })

  it('names the switched-off Policies feature, keeps local policy files and prints no skill hint', async () => {
    source = policy('OLD')
    await command.run()
    logs.length = 0
    listing = () => new Response(JSON.stringify({
      code: 'ERROR_CODE_ACCESS_DENIED', message: 'Policies are not enabled on this instance.', payload: {code: 'policy_feature_disabled'},
    }), {status: 403})
    source = 'function first {\n}'
    await command.run()
    expect(warnings).to.deep.equal([])
    expect(logs.filter(line => line.includes('policy files'))).to.deep.equal([
      'Local policy files were kept: Policies are not enabled on this instance, so the export carries none.',
    ])
    expect(logs.join('\n')).not.to.contain('xano skills pull')
    expect(fs.readFileSync(path.join(directory, 'policies', 'OLD.xs'), 'utf8')).to.equal(policy('OLD'))
  })
})
