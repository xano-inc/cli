import {Config} from '@oclif/core'
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

interface Call {
  body?: string
  method: string
  url: URL
}

// DEV-9277: Xano Run was removed, so a tenant cluster is always `standard`. `--type run` is refused,
// and `cluster edit` no longer needs `--type` (it sends `standard`).
describe('tenant cluster --type', () => {
  const calls: Call[] = []
  let config: Config
  let directory: string
  let environment: NodeJS.ProcessEnv
  let originalFetch: typeof globalThis.fetch

  before(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xano-cluster-type-'))
    fs.writeFileSync(
      path.join(directory, 'credentials.yaml'),
      'profiles:\n  fixture:\n    instance_origin: https://test.example.com\n    access_token: test-token\n    workspace: 1\ndefault: fixture\n',
    )
    config = await Config.load({root: process.cwd(), version: '1.2.0-beta.test'})
  })

  after(() => fs.rmSync(directory, {force: true, recursive: true}))

  beforeEach(() => {
    environment = {...process.env}
    originalFetch = globalThis.fetch
    process.env.XANO_CONFIG = path.join(directory, 'credentials.yaml')
    process.env.XANO_PROFILE = 'fixture'
    delete process.env.XANO_VERBOSE
    delete process.env.XANO_FORCE_UPDATE_CHECK
    calls.length = 0
    globalThis.fetch = (async (input, requestOptions) => {
      calls.push({
        body: requestOptions?.body as string | undefined,
        method: requestOptions?.method ?? 'GET',
        url: new URL(String(input)),
      })
      return new Response(JSON.stringify({id: 7, name: 'c1', type: 'standard'}), {status: 200})
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    process.env = environment
    globalThis.fetch = originalFetch
    process.exitCode = undefined
  })

  const clusterCall = () => calls.find((call) => call.url.pathname.startsWith('/api:meta/tenant/cluster'))

  it('refuses --type run on create', async () => {
    const result = await runCommand(
      ['tenant', 'cluster', 'create', '--name', 'c1', '--credentials', 'kubeconfig', '--type', 'run'],
      config,
    )
    expect(result.error?.message).to.match(/Expected --type=run to be one of: standard/)
    expect(clusterCall()).to.equal(undefined)
  })

  it('creates a standard cluster by default', async () => {
    const result = await runCommand(['tenant', 'cluster', 'create', '--name', 'c1', '--credentials', 'kubeconfig'], config)
    expect(result.error).to.equal(undefined)
    expect(clusterCall()?.method).to.equal('POST')
    expect(JSON.parse(clusterCall()?.body ?? '{}').type).to.equal('standard')
  })

  it('refuses --type run on edit', async () => {
    const result = await runCommand(
      ['tenant', 'cluster', 'edit', '7', '--name', 'c1', '-d', 'eu', '--domain', 'eu.example.com', '--type', 'run'],
      config,
    )
    expect(result.error?.message).to.match(/Expected --type=run to be one of: standard/)
    expect(clusterCall()).to.equal(undefined)
  })

  it('edits without --type and sends standard', async () => {
    const result = await runCommand(['tenant', 'cluster', 'edit', '7', '--name', 'c1', '-d', 'eu', '--domain', 'eu.example.com'], config)
    expect(result.error).to.equal(undefined)
    expect(clusterCall()?.method).to.equal('PUT')
    expect(clusterCall()?.url.pathname).to.equal('/api:meta/tenant/cluster/7')
    expect(JSON.parse(clusterCall()?.body ?? '{}').type).to.equal('standard')
  })
})
