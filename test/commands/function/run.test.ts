import {Config} from '@oclif/core'
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

interface Call {
  body?: string
  headers: Record<string, string>
  method: string
  url: URL
}

describe('function run', () => {
  const calls: Call[] = []
  let config: Config
  let directory: string
  let environment: NodeJS.ProcessEnv
  let originalFetch: typeof globalThis.fetch

  before(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xano-function-run-'))
    fs.writeFileSync(
      path.join(directory, 'credentials.yaml'),
      'profiles:\n  fixture:\n    instance_origin: https://test.example.com\n    access_token: test-token\n    workspace: 1\n    branch: feature\ndefault: fixture\n',
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
        headers: (requestOptions?.headers ?? {}) as Record<string, string>,
        method: requestOptions?.method ?? 'GET',
        url: new URL(String(input)),
      })
      const body = String(input).includes('/run') ? {result: 42, status: 'ok'} : []
      return new Response(JSON.stringify(body), {status: 200})
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    process.env = environment
    globalThis.fetch = originalFetch
    process.exitCode = undefined
  })

  const runCall = () => calls.find((call) => call.url.pathname.endsWith('/run'))
  const listCall = () => calls.find((call) => call.url.pathname.endsWith('/function'))

  it('runs against the workspace when no tenant is given', async () => {
    const result = await runCommand(['function', 'run', 'calcScore', '--no-input-check'], config)
    expect(result.error).to.equal(undefined)
    expect(runCall()?.url.pathname).to.equal('/api:meta/workspace/1/function/run')
    expect(runCall()?.headers).not.to.have.property('X-Tenant')
    expect(result.stdout.trim()).to.equal('42')
  })

  it('runs on the tenant with --tenant by sending the X-Tenant header', async () => {
    const result = await runCommand(['function', 'run', 'calcScore', '--tenant', 'my-tenant', '--no-input-check'], config)
    expect(result.error).to.equal(undefined)
    expect(runCall()?.method).to.equal('POST')
    expect(runCall()?.url.pathname).to.equal('/api:meta/workspace/1/function/run')
    expect(runCall()?.headers['X-Tenant']).to.equal('my-tenant')
    expect(JSON.parse(runCall()?.body ?? '{}')).to.deep.equal({branch: 'feature', input: {}, name: 'calcScore'})
  })

  it('accepts -t as the short form of --tenant', async () => {
    await runCommand(['function', 'run', 'calcScore', '-t', 'acme', '--no-input-check'], config)
    expect(runCall()?.headers['X-Tenant']).to.equal('acme')
  })

  it('reads the declared inputs from the tenant too', async () => {
    await runCommand(['function', 'run', 'calcScore', '-t', 'acme'], config)
    expect(listCall()?.url.pathname).to.equal('/api:meta/workspace/1/function')
    expect(listCall()?.headers['X-Tenant']).to.equal('acme')
  })
})
