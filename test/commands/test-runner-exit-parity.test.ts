/*
 * `fetch` and `Response` are flagged by n/no-unsupported-features/node-builtins
 * against this package's >=20.12.0 engine range. Both are used unguarded
 * throughout src/ (BaseCommand.verboseFetch among them), so stubbing them here
 * matches what the code under test already does.
 */
/* eslint-disable n/no-unsupported-features/node-builtins */
import {runCommand} from '@oclif/test'
import {expect} from 'chai'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import SandboxUnitTestRun from '../../src/commands/sandbox/unit_test/run/index.js'
import SandboxUnitTestRunAll from '../../src/commands/sandbox/unit_test/run_all/index.js'
import SandboxWorkflowTestRun from '../../src/commands/sandbox/workflow_test/run/index.js'
import SandboxWorkflowTestRunAll from '../../src/commands/sandbox/workflow_test/run_all/index.js'
import TenantUnitTestRun from '../../src/commands/tenant/unit_test/run/index.js'
import TenantUnitTestRunAll from '../../src/commands/tenant/unit_test/run_all/index.js'
import TenantWorkflowTestRun from '../../src/commands/tenant/workflow_test/run/index.js'
import TenantWorkflowTestRunAll from '../../src/commands/tenant/workflow_test/run_all/index.js'
import UnitTestRun from '../../src/commands/unit_test/run/index.js'
import UnitTestRunAll from '../../src/commands/unit_test/run_all/index.js'
import WorkflowTestRun from '../../src/commands/workflow_test/run/index.js'
import WorkflowTestRunAll from '../../src/commands/workflow_test/run_all/index.js'

/**
 * Guards the exit-code and JSON-output contract shared by every test-runner
 * command, across all four surfaces (top-level, tenant, sandbox).
 *
 * Two defects motivated this file, and both existed in all twelve commands
 * because the fix was copy-pasted between siblings without it:
 *
 *   DEV-7545 -- `run -o json` printed the verdict and exited 0 on failure,
 *               so CI adding -o json silently lost failure detection.
 *   DEV-7546 -- `run_all -o json` printed a bare string on an empty branch,
 *               so JSON.parse() threw instead of reporting "nothing to run".
 *
 * Three layers, ordered by how directly they cover those defects:
 *
 *   1. Behavioral -- stub `globalThis.fetch` and assert the REAL exit code and
 *      stdout. This is the only layer that covers the bugs themselves.
 *   2. Static surface -- flag shape across the family, so a new sibling that
 *      forgets `--output` fails here rather than in someone's pipeline.
 *   3. Source scan -- the oclif re-throw guard and the absence of `this.exit(`,
 *      which catches a regression in a file nobody wrote a behavioral case for.
 *
 * Note on layer 2: `run` and `run_all` deliberately do NOT agree on flag shape.
 * `run` has no `--branch` on any surface, and the sandbox commands have neither
 * `--workspace` nor `--tenant`. That is an intentional gap, not a defect, so it
 * is recorded here rather than asserted as parity.
 */

const flagsOf = (cmd: {flags: Record<string, unknown>}): string[] => Object.keys(cmd.flags).sort()

// --- fetch stubbing -------------------------------------------------------

interface StubOptions {
  /** Body returned by the list endpoint. Defaults to a single test. */
  list?: unknown
  /** HTTP status for the list endpoint. */
  listStatus?: number
  /** Body returned by an individual test's /run endpoint. */
  run?: unknown
  /** HTTP status for the /run endpoint. */
  runStatus?: number
}

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}, status})

/**
 * `BaseCommand.verboseFetch` bottoms out in a bare `fetch()` against the
 * global, so routing by URL here is enough to drive a whole command. `/run`
 * is the per-test endpoint; everything else is the list call.
 */
function stubFetch(options: StubOptions = {}): void {
  const {list = [{id: 1, name: 'a-test'}], listStatus = 200, run = {status: 'ok'}, runStatus = 200} = options

  globalThis.fetch = (async (input: Parameters<typeof globalThis.fetch>[0]) => {
    const url = String(input)
    return url.includes('/run') ? json(run, runStatus) : json(list, listStatus)
  }) as typeof globalThis.fetch
}

// --- command tables -------------------------------------------------------

interface RunCase {
  argv: string[]
  kind: 'unit' | 'workflow'
  name: string
}

const RUN_COMMANDS: RunCase[] = [
  {argv: ['unit_test', 'run', '1'], kind: 'unit', name: 'unit_test run'},
  {argv: ['workflow_test', 'run', '1'], kind: 'workflow', name: 'workflow_test run'},
  {argv: ['tenant', 'unit_test', 'run', '1', '--tenant', 't1'], kind: 'unit', name: 'tenant unit_test run'},
  {argv: ['tenant', 'workflow_test', 'run', '1', '--tenant', 't1'], kind: 'workflow', name: 'tenant workflow_test run'},
  {argv: ['sandbox', 'unit_test', 'run', '1'], kind: 'unit', name: 'sandbox unit_test run'},
  {argv: ['sandbox', 'workflow_test', 'run', '1'], kind: 'workflow', name: 'sandbox workflow_test run'},
]

interface RunAllCase {
  argv: string[]
  /** Exact key set of this command's JSON envelope, empty and populated alike. */
  keys: string[]
  name: string
}

const BASE_KEYS = ['failed', 'passed', 'results']

const RUN_ALL_COMMANDS: RunAllCase[] = [
  {argv: ['unit_test', 'run_all'], keys: BASE_KEYS, name: 'unit_test run_all'},
  // The only command carrying total_timing. Normalizing the shapes across
  // commands is deferred, breaking work -- so this stays asymmetric on purpose.
  {argv: ['workflow_test', 'run_all'], keys: [...BASE_KEYS, 'total_timing'], name: 'workflow_test run_all'},
  {argv: ['tenant', 'unit_test', 'run_all', '--tenant', 't1'], keys: BASE_KEYS, name: 'tenant unit_test run_all'},
  {
    argv: ['tenant', 'workflow_test', 'run_all', '--tenant', 't1'],
    keys: BASE_KEYS,
    name: 'tenant workflow_test run_all',
  },
  {argv: ['sandbox', 'unit_test', 'run_all'], keys: BASE_KEYS, name: 'sandbox unit_test run_all'},
  {argv: ['sandbox', 'workflow_test', 'run_all'], keys: BASE_KEYS, name: 'sandbox workflow_test run_all'},
]

/** A failing payload for each command family. Anything not 'ok' is a failure. */
const failingResult = (kind: 'unit' | 'workflow'): unknown =>
  kind === 'unit'
    ? {message: 'assertion failed', results: [{message: 'expected true', status: 'fail'}], status: 'exception'}
    : {message: 'Precondition failed.', status: 'exception', timing: 0.02}

const passingResult = (kind: 'unit' | 'workflow'): unknown =>
  kind === 'unit' ? {results: [], status: 'ok'} : {status: 'ok', timing: 1.234}

describe('test-runner exit-code and JSON parity', () => {
  let tmpDir: string
  let originalFetch: typeof globalThis.fetch
  let originalConfig: string | undefined

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xano-exit-parity-'))
    fs.writeFileSync(
      path.join(tmpDir, 'credentials.yaml'),
      [
        'profiles:',
        '  default:',
        '    instance_origin: https://test.example.com',
        '    access_token: test-token',
        '    workspace: 1',
        'default: default',
      ].join('\n'),
    )
    originalConfig = process.env.XANO_CONFIG
    process.env.XANO_CONFIG = path.join(tmpDir, 'credentials.yaml')
  })

  after(() => {
    if (originalConfig === undefined) {
      delete process.env.XANO_CONFIG
    } else {
      process.env.XANO_CONFIG = originalConfig
    }

    fs.rmSync(tmpDir, {force: true, recursive: true})
  })

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // A command under test sets process.exitCode on failure. Left in place it
    // leaks into the mocha process and reports the whole suite as failed with
    // every assertion green -- a genuinely confusing way to lose an afternoon.
    process.exitCode = undefined
  })

  describe('behavioral: run exits non-zero on failure in BOTH output modes', () => {
    for (const {argv, kind, name} of RUN_COMMANDS) {
      it(`${name} -o json exits 1 on a failed test and still prints parseable JSON`, async () => {
        stubFetch({run: failingResult(kind)})

        const {stdout} = await runCommand([...argv, '-o', 'json'])

        // The regression DEV-7545 filed: the body was always right, the exit was not.
        expect(process.exitCode, 'exit code').to.equal(1)
        expect(() => JSON.parse(stdout)).to.not.throw()
        expect(JSON.parse(stdout).status).to.equal('exception')
      })

      it(`${name} summary exits 1 (not 2) on a failed test with no EEXIT noise`, async () => {
        stubFetch({run: failingResult(kind)})

        const {stdout} = await runCommand(argv)

        expect(process.exitCode, 'exit code').to.equal(1)
        expect(stdout).to.contain('Result: FAIL')
        // The old this.exit(1) was swallowed by the catch and re-raised through
        // this.error(), producing exit 2 plus a trailing 'EEXIT: 1' line.
        expect(stdout).to.not.contain('EEXIT')
      })

      it(`${name} exits 0 on a passing test in both output modes`, async () => {
        for (const extra of [[], ['-o', 'json']]) {
          stubFetch({run: passingResult(kind)})
          // eslint-disable-next-line no-await-in-loop
          await runCommand([...argv, ...extra])
          expect(process.exitCode ?? 0, `exit code (${extra.join(' ') || 'summary'})`).to.equal(0)
        }
      })

      it(`${name} treats an unrecognized non-ok status as failure`, async () => {
        // Three distinct non-ok statuses have been seen in the wild, so the
        // check must be "anything not ok", never an enumeration of known values.
        stubFetch({run: {status: 'debug'}})

        await runCommand([...argv, '-o', 'json'])

        expect(process.exitCode, 'exit code').to.equal(1)
      })
    }

    it('workflow_test run exits 1 when a failing result omits timing', async () => {
      // timing was typed required and .toFixed() ran before the status check,
      // so an absent value threw into the catch and exited 2 instead of 1.
      stubFetch({run: {message: 'Precondition failed.', status: 'exception'}})

      const {stdout} = await runCommand(['workflow_test', 'run', '1'])

      expect(process.exitCode, 'exit code').to.equal(1)
      expect(stdout).to.contain('Result: FAIL')
    })

    it('run exits 2 when the API call itself fails', async () => {
      stubFetch({run: {message: 'boom'}, runStatus: 500})

      const {error} = await runCommand(['workflow_test', 'run', '1'])

      // A broken API call is a CLI error, not a test failure -- exit 2, not 1.
      expect(error?.oclif?.exit).to.equal(2)
    })
  })

  describe('behavioral: run_all emits valid JSON when there are no tests', () => {
    for (const {argv, keys, name} of RUN_ALL_COMMANDS) {
      it(`${name} -o json emits a parseable zero envelope on an empty list`, async () => {
        stubFetch({list: []})

        const {stdout} = await runCommand([...argv, '-o', 'json'])

        // The regression DEV-7546 filed: this used to be the bare string
        // "No workflow tests found", and JSON.parse threw a SyntaxError.
        expect(() => JSON.parse(stdout)).to.not.throw()
        const parsed = JSON.parse(stdout)
        expect(Object.keys(parsed).sort()).to.deep.equal([...keys].sort())
        expect(parsed.passed).to.equal(0)
        expect(parsed.failed).to.equal(0)
        expect(parsed.results).to.deep.equal([])
        // An empty suite is success, not failure.
        expect(process.exitCode ?? 0, 'exit code').to.equal(0)
      })

      it(`${name} summary still prints the plain empty message`, async () => {
        stubFetch({list: []})

        const {stdout} = await runCommand(argv)

        expect(stdout).to.match(/No (unit|workflow) tests found/)
        expect(process.exitCode ?? 0, 'exit code').to.equal(0)
      })

      it(`${name} empty and populated envelopes have identical key sets`, async () => {
        stubFetch({list: []})
        const empty = JSON.parse((await runCommand([...argv, '-o', 'json'])).stdout)

        stubFetch({list: [{id: 1, name: 'a-test'}], run: {status: 'ok', timing: 1}})
        const populated = JSON.parse((await runCommand([...argv, '-o', 'json'])).stdout)

        // Two code paths build these envelopes, so they can drift the next time
        // a field is added. This is the assertion that catches that.
        expect(Object.keys(empty).sort()).to.deep.equal(Object.keys(populated).sort())
      })
    }

    it('run_all exits 1 when a test fails', async () => {
      stubFetch({run: failingResult('workflow')})

      await runCommand(['workflow_test', 'run_all', '-o', 'json'])

      expect(process.exitCode, 'exit code').to.equal(1)
    })

    it('run_all reports a per-test API error as a failed test (exit 1), not a CLI error', async () => {
      stubFetch({run: {message: 'upstream exploded'}, runStatus: 500})

      const {stdout} = await runCommand(['workflow_test', 'run_all', '-o', 'json'])

      // Deliberate asymmetry with `run`, which exits 2 on the same 500:
      // run_all's job is to finish the batch and report a roll-up. Consumers
      // distinguishing an outage from a real assertion failure must read
      // results[].message. Documented in the README exit-code contract.
      expect(process.exitCode, 'exit code').to.equal(1)
      const parsed = JSON.parse(stdout)
      expect(parsed.failed).to.equal(1)
      expect(parsed.results[0].message).to.contain('API error 500')
    })

    it('run_all exits 2 when the list call fails', async () => {
      stubFetch({list: {message: 'nope'}, listStatus: 500})

      const {error} = await runCommand(['workflow_test', 'run_all', '-o', 'json'])

      // The batch never started, so this is a CLI error rather than a failure.
      expect(error?.oclif?.exit).to.equal(2)
    })
  })

  describe('static surface: flag shape across the family', () => {
    const RUN_CLASSES: Array<[string, {flags: Record<string, unknown>}]> = [
      ['unit_test run', UnitTestRun],
      ['workflow_test run', WorkflowTestRun],
      ['tenant unit_test run', TenantUnitTestRun],
      ['tenant workflow_test run', TenantWorkflowTestRun],
      ['sandbox unit_test run', SandboxUnitTestRun],
      ['sandbox workflow_test run', SandboxWorkflowTestRun],
    ]

    const RUN_ALL_CLASSES: Array<[string, {flags: Record<string, unknown>}]> = [
      ['unit_test run_all', UnitTestRunAll],
      ['workflow_test run_all', WorkflowTestRunAll],
      ['tenant unit_test run_all', TenantUnitTestRunAll],
      ['tenant workflow_test run_all', TenantWorkflowTestRunAll],
      ['sandbox unit_test run_all', SandboxUnitTestRunAll],
      ['sandbox workflow_test run_all', SandboxWorkflowTestRunAll],
    ]

    for (const [name, cmd] of [...RUN_CLASSES, ...RUN_ALL_CLASSES]) {
      it(`${name} offers the same --output contract`, () => {
        const output = cmd.flags.output as {default: string; options: string[]}
        expect(output, 'output flag').to.exist
        expect(output.options).to.deep.equal(['summary', 'json'])
        expect(output.default).to.equal('summary')
      })
    }

    for (const [name, cmd] of RUN_ALL_CLASSES) {
      it(`${name} offers --branch and --concurrency`, () => {
        // run_all iterates a suite, so it filters by branch and parallelizes.
        // `run` targets one test by id and does neither -- see the header note.
        expect(flagsOf(cmd)).to.include.members(['branch', 'concurrency'])
        expect((cmd.flags.concurrency as {default: number}).default).to.equal(1)
      })
    }
  })

  describe('source scan: no command may reintroduce the swallowed exit', () => {
    const COMMAND_FILES = [
      'unit_test/run',
      'unit_test/run_all',
      'workflow_test/run',
      'workflow_test/run_all',
      'tenant/unit_test/run',
      'tenant/unit_test/run_all',
      'tenant/workflow_test/run',
      'tenant/workflow_test/run_all',
      'sandbox/unit_test/run',
      'sandbox/unit_test/run_all',
      'sandbox/workflow_test/run',
      'sandbox/workflow_test/run_all',
    ].map((p) => `src/commands/${p}/index.ts`)

    for (const file of COMMAND_FILES) {
      it(`${file} guards every catch block and sets no bare this.exit`, () => {
        const source = fs.readFileSync(file, 'utf8')

        // Each run_all has two catch blocks -- an inner per-test handler and an
        // outer one -- so the family has 18 across twelve files, not 12.
        const catches = (source.match(/catch \(error\)/g) ?? []).length
        const guards = (source.match(/'oclif' in error/g) ?? []).length
        expect(catches, 'catch blocks').to.be.greaterThan(0)
        expect(guards, `every catch in ${file} must re-throw oclif errors`).to.equal(catches)

        // this.exit() throws an ExitError the surrounding catch would swallow.
        // process.exitCode is the mechanism that survives it.
        expect(source, 'must not call this.exit()').to.not.match(/^\s*this\.exit\(/m)
      })
    }
  })
})
