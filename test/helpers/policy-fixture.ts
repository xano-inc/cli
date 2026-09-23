/* eslint-disable mocha/no-exports, mocha/no-top-level-hooks -- Shared suite scaffolding registers hooks for the calling describe. */
import {Config} from '@oclif/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status})

export interface PolicyCall {
  body?: string
  method: string
  url: URL
}

export interface PolicyFixture {
  /** Every request made through the stubbed fetch since the current test started. */
  calls: PolicyCall[]
  config: Config
  /** Temp directory holding credentials.yaml and policy.xs. */
  directory: string
  /** Stub global fetch with a handler and record each call. */
  route(handler: (url: URL, method: string, body?: string) => Response): void
}

/**
 * Register the mocha hooks shared by the policy suites: an offline credentials file selected
 * through XANO_CONFIG/XANO_PROFILE, a stubbed fetch restored after each test, and a clean exit code.
 */
export function policyFixture(options: {branch?: string; profile?: string; source?: string; workspace?: string} = {}): PolicyFixture {
  const {branch = 'feature', profile = 'fixture', source = 'policy AUTH-001 { title = "Auth" }', workspace = '1'} = options
  const fixture: PolicyFixture = {calls: [], config: undefined as unknown as Config, directory: '', route}
  let environment: NodeJS.ProcessEnv
  let originalFetch: typeof globalThis.fetch

  before(async () => {
    fixture.directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xano-policy-cli-'))
    fs.writeFileSync(path.join(fixture.directory, 'policy.xs'), source)
    fs.writeFileSync(
      path.join(fixture.directory, 'credentials.yaml'),
      `profiles:\n  ${profile}:\n    instance_origin: https://test.example.com\n    access_token: test-token\n    workspace: ${workspace}\n    branch: ${branch}\ndefault: ${profile}\n`,
    )
    // Set the load option so oclif keeps the offline version when it reloads this config.
    fixture.config = await Config.load({root: process.cwd(), version: '1.2.0-beta.test'})
  })

  after(() => fs.rmSync(fixture.directory, {force: true, recursive: true}))

  beforeEach(() => {
    environment = {...process.env}
    originalFetch = globalThis.fetch
    process.env.XANO_CONFIG = path.join(fixture.directory, 'credentials.yaml')
    process.env.XANO_PROFILE = profile
    delete process.env.XANO_VERBOSE
    delete process.env.XANO_FORCE_UPDATE_CHECK
    fixture.calls.length = 0
  })

  afterEach(() => {
    process.env = environment
    globalThis.fetch = originalFetch
    process.exitCode = undefined
  })

  function route(handler: (url: URL, method: string, body?: string) => Response): void {
    globalThis.fetch = (async (input, requestOptions) => {
      const url = new URL(String(input))
      const method = requestOptions?.method ?? 'GET'
      const body = requestOptions?.body as string | undefined
      fixture.calls.push({body, method, url})
      return handler(url, method, body)
    }) as typeof globalThis.fetch
  }

  return fixture
}
