import {Config} from '@oclif/core'
import {expect} from 'chai'
import * as fs from 'node:fs'
import {syncBuiltinESMExports} from 'node:module'
import {tmpdir} from 'node:os'
import path from 'node:path'
import readline from 'node:readline'

import Push from '../../../../src/commands/workspace/push/index.js'
import {executePush, type PushFlags} from '../../../../src/utils/multidoc-push.js'

describe('workspace push preview safety', () => {
  let directory: string
  let command: Push
  let requests: string[]
  let output: string[]
  let prompts: number
  let flags: Record<string, unknown>
  let response: () => Response
  const originalInterface = readline.createInterface
  const originalTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(tmpdir(), 'xano-push-preview-'))
    fs.writeFileSync(path.join(directory, 'AUTH-001.xs'), 'policy AUTH-001 {\n title = "Auth"\n}')
    requests = []
    output = []
    prompts = 0
    flags = {
      delete: false,
      directory,
      'dry-run': true,
      env: false,
      force: false,
      guids: true,
      output: 'summary',
      records: false,
      sync: false,
      transaction: true,
      truncate: false,
      verbose: false,
    }
    command = Object.assign(new Push([], {version: 'test'} as Config), {
      log: (message: string) => output.push(message),
      parse: async () => ({flags}),
      resolveProfile: () => ({profile: {access_token: 'test', instance_origin: 'https://test.example', workspace: '1'}}),
      async verboseFetch(url: string) {
        requests.push(url)
        return response()
      },
      warn: (message: string) => output.push(message),
    })
    // Accept any unexpected prompt so a dry-run falling through to import is observable.
    readline.createInterface = (() => ({
      close() {},
      on() {},
      question(_message: string, answer: (value: string) => void) {
        prompts++
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
    fs.rmSync(directory, {force: true, recursive: true})
    process.exitCode = undefined
  })

  async function failure(run = () => command.run()): Promise<Error & {oclif?: {exit: number}}> {
    try {
      await run()
    } catch (error) {
      return error as Error & {oclif?: {exit: number}}
    }

    throw new Error('Expected command to fail')
  }

  const failures = [
    {label: 'HTTP 503', message: 'Preview unavailable', response: () => new Response('Preview unavailable', {status: 503})},
    {label: 'HTTP 401', message: 'Invalid token', response: () => new Response('{"message":"Invalid token"}', {status: 401})},
    {label: 'HTTP 404', message: 'Workspace missing', response: () => new Response('Workspace missing', {status: 404})},
    {label: 'invalid JSON', message: 'Push preview failed', response: () => new Response('<html>Unavailable</html>')},
    ...[null, {}, {summary: {}}, {operations: {}, summary: {}}, {operations: [], summary: []}, {operations: [], summary: {policy: null}}, {operations: [null], summary: {}}].map(body => ({
      label: `malformed envelope ${JSON.stringify(body)}`,
      message: 'Invalid push preview response',
      response: () => new Response(JSON.stringify(body)),
    })),
    {label: 'network error', message: 'connection refused', response() { throw new Error('connection refused') }},
    {label: 'aborted preview', message: 'preview timed out', response() { throw Object.assign(new Error('preview timed out'), {name: 'AbortError'}) }},
  ]
  for (const isTTY of [false, true]) {
    for (const force of [false, true]) {
      for (const scenario of failures) {
        it(`fails dry-run without importing: ${scenario.label}, tty=${isTTY}, force=${force}`, async () => {
          Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: isTTY})
          flags.force = force
          response = scenario.response
          const error = await failure()
          expect(error.oclif?.exit).to.equal(1)
          expect(error.message).to.contain(scenario.message)
          expect([error.message, ...output].join('\n')).not.to.contain('Use --force to skip confirmation')
          expect(prompts).to.equal(0)
          expect(requests).to.have.length(1)
          expect(new URL(requests[0]).pathname).to.match(/\/multidoc\/dry-run$/)
        })
      }
    }
  }

  for (const force of [false, true]) {
    it(`refuses dry-run import when the target has no preview URL, force=${force}`, async () => {
      flags.force = force
      const error = await failure(() => executePush({
        accessToken: 'test',
        branch: '',
        command,
        inputDir: directory,
        async verboseFetch(url) {
          requests.push(url)
          return new Response('{}')
        },
      }, {
        buildDryRunUrl: () => null,
        buildPushUrl: () => 'https://test.example/multidoc',
        cliVersion: 'test',
        instanceOrigin: 'https://test.example',
        label: 'test target',
        supportsBranches: true,
        supportsPartial: true,
      }, flags as unknown as PushFlags))
      expect(error.oclif?.exit).to.equal(1)
      expect(error.message).to.contain('preview is not available')
      expect(requests).to.deep.equal([])
      expect(prompts).to.equal(0)
    })

    it(`returns after a successful dry-run with force=${force}`, async () => {
      flags.force = force
      response = () => new Response(JSON.stringify({
        operations: [{action: 'update', details: '', name: 'AUTH-001', type: 'policy'}],
        summary: {policy: {created: 0, deleted: 0, truncated: 0, unchanged: 0, updated: 1}},
      }))
      await command.run()
      expect(prompts).to.equal(0)
      expect(requests).to.have.length(1)
    })
  }

  for (const [dryRun, force] of [[true, false], [true, true], [false, false]]) {
    it(`fails critical previews with dry-run=${dryRun}, force=${force}`, async () => {
      flags['dry-run'] = dryRun
      flags.force = force
      flags.output = 'json'
      response = () => new Response(JSON.stringify({
        operations: [{action: 'create', details: 'exception: invalid syntax', name: 'AUTH-001', type: 'policy'}],
        summary: {policy: {created: 1, deleted: 0, truncated: 0, unchanged: 0, updated: 0}},
      }))
      const error = await failure()
      expect(error.oclif?.exit).to.equal(1)
      expect(error.message).to.contain('Push blocked: 1 critical error(s)')
      expect(requests).to.have.length(1)
      expect(prompts).to.equal(0)
    })
  }

  const disabled = [
    // The backend raises this from a YAML assert (cloud-client meta/multidoc.yaml), so it is an HTTP 500.
    {message: "Push is disabled for this workspace. Enable 'Allow Push' in Workspace Settings, or use sandbox commands instead: xano sandbox push, xano sandbox impersonate", status: 500},
    {message: 'Push is disabled', status: 403},
  ]
  for (const {message, status} of disabled) {
    for (const dryRun of [false, true]) {
      for (const force of [false, true]) {
        it(`fails disabled push with HTTP ${status}, dry-run=${dryRun}, force=${force}`, async () => {
          flags['dry-run'] = dryRun
          flags.force = force
          response = () => new Response(JSON.stringify({message}), {status})
          const error = await failure()
          expect(error.oclif?.exit).to.equal(1)
          expect(error.message).to.contain(message)
          expect(error.message).to.contain('Allow Direct Workspace Push')
          expect(error.message).not.to.contain('{"message"')
          expect(requests).to.have.length(1)
          expect(prompts).to.equal(0)
        })
      }
    }
  }

  it('exits 1 with the raw server message when the import itself fails', async () => {
    flags['dry-run'] = false
    flags.force = true
    response = () => new Response(JSON.stringify({message: 'Invalid block: enforcement', payload: {param: 'source'}}), {status: 500})
    const error = await failure()
    expect(error.oclif?.exit).to.equal(1)
    expect(error.message).to.equal('Push failed (500): Invalid block: enforcement\n  Parameter: source')
    expect(requests).to.have.length(1)
    expect(new URL(requests[0]).pathname).to.match(/\/multidoc$/)
  })
})
