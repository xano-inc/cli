/* eslint-disable n/no-unsupported-features/node-builtins -- Response/ReadableStream/TextEncoder/AbortController are stable on the Node 20.12 floor this package targets; the rule's support data is stale, and src/utils/sse.ts hits the same false positives */
import {expect} from 'chai'

import type {CreateSessionResponse, SessionSnapshot} from '../../../src/utils/hatch-contract.js'

import Hatch, {
  type HatchRunResult,
  type HatchSessionApi,
  type HatchSpinner,
  parseActivity,
  runHatch,
  validatePrompt,
  WATCH_CAP_MS,
} from '../../../src/commands/hatch/index.js'
import {HatchClient, resolveHatchUrl} from '../../../src/utils/hatch-client.js'

const WATCH_URL = 'https://hatch.mesh0.ai/s/K7QM2XPA9RTV'
const SITE_URL = 'https://bakery-a91f.xano.io'

/** Reconnect settings that make a dropped stream fail immediately instead of sleeping. */
const NO_RECONNECT = {maxAttempts: 0}

function frame(activity: Record<string, unknown>): string {
  return `id: ${activity.seq}\ndata: ${JSON.stringify(activity)}\n\n`
}

function streamOf(chunks: string[], options: {keepOpen?: boolean} = {}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      if (!options.keepOpen) controller.close()
    },
  })
}

interface Recorder {
  err(line: string): void
  errLines: string[]
  out(line: string): void
  outLines: string[]
}

function recorder(): Recorder {
  const errLines: string[] = []
  const outLines: string[] = []
  return {
    err(line) {
      errLines.push(line)
    },
    errLines,
    out(line) {
      outLines.push(line)
    },
    outLines,
  }
}

function recordingSpinner(): {calls: string[]; spinner: HatchSpinner} {
  const calls: string[] = []
  return {
    calls,
    spinner: {
      start(action, status) {
        calls.push(`start:${action}:${status ?? ''}`)
      },
      stop(message) {
        calls.push(`stop:${message ?? ''}`)
      },
      update(status) {
        calls.push(`update:${status}`)
      },
    },
  }
}

interface StubConfig {
  frames?: string[]
  keepOpen?: boolean
  onOpen?: () => void
  openError?: Error
  snapshot?: Partial<SessionSnapshot>
  watchUrl?: null | string
}

class StubClient implements HatchSessionApi {
  created = 0
  openedWith: (number | string | undefined)[] = []
  prompts: string[] = []
  snapshotCalls = 0

  constructor(private readonly config: StubConfig = {}) {}

  async createSession(): Promise<CreateSessionResponse> {
    this.created += 1
    const watchUrl = this.config.watchUrl === null ? undefined : (this.config.watchUrl ?? WATCH_URL)
    return {sessionId: 'sess-1', state: 'draft', ...(watchUrl === undefined ? {} : {watchUrl})}
  }

  async getSnapshot(): Promise<SessionSnapshot> {
    this.snapshotCalls += 1
    return {
      createdAt: 0,
      phase: 'backend',
      prompt: 'p',
      sessionId: 'sess-1',
      state: 'building',
      ...this.config.snapshot,
    } as SessionSnapshot
  }

  async openStream(_sessionId: string, lastEventId?: number | string): Promise<Response> {
    this.openedWith.push(lastEventId)
    this.config.onOpen?.()
    if (this.config.openError) throw this.config.openError
    return new Response(streamOf(this.config.frames ?? [], {keepOpen: this.config.keepOpen}))
  }

  async submitPrompt(_sessionId: string, prompt: string): Promise<void> {
    this.prompts.push(prompt)
  }
}

const PHASE = {at: 1, kind: 'phase', phase: 'scaffolding', seq: 1}
const NARRATION = {at: 2, kind: 'narration', message: 'writing the order table', seq: 2}
const SUCCEEDED = {at: 3, kind: 'terminal', outcome: 'succeeded', seq: 3, siteUrl: SITE_URL}
const FAILED = {at: 3, kind: 'terminal', message: 'the agent could not build it', outcome: 'failed', seq: 3}

function run(client: HatchSessionApi, overrides: Partial<Parameters<typeof runHatch>[0]> = {}): Promise<HatchRunResult> {
  const io = overrides.io ?? recorder()
  return runHatch({
    animate: false,
    client,
    io,
    json: false,
    prompt: 'a landing page for a bakery',
    reconnect: NO_RECONNECT,
    verbose: false,
    wait: true,
    ...overrides,
  })
}

describe('hatch command', () => {
  describe('the oclif shell', () => {
    it('takes exactly one positional argument, required', () => {
      expect(Object.keys(Hatch.args)).to.deep.equal(['prompt'])
      expect(Hatch.args.prompt.required).to.equal(true)
    })

    it('exposes --api, -o/--output, --verbose and --no-wait', () => {
      expect(Object.keys(Hatch.flags).sort()).to.deep.equal(['api', 'no-wait', 'output', 'verbose'])
      expect(Hatch.flags.output.char).to.equal('o')
    })
  })

  describe('the prompt', () => {
    it('rejects an empty prompt before any network call', async () => {
      const client = new StubClient()
      const error = await run(client, {prompt: ''}).then(
        () => {},
        (error_: Error) => error_,
      )

      expect(error?.message).to.contain('a prompt is required')
      expect(client.created).to.equal(0)
      expect(client.prompts).to.deep.equal([])
    })

    it('rejects a whitespace-only prompt before any network call', async () => {
      const client = new StubClient()
      const error = await run(client, {prompt: '   \n\t '}).then(
        () => {},
        (error_: Error) => error_,
      )

      expect(error?.message).to.contain('a prompt is required')
      expect(client.created).to.equal(0)
    })

    it('sends a prompt longer than 5000 characters as-is — the server truncates, not the client', async () => {
      const long = 'a'.repeat(6000)
      const client = new StubClient()
      await run(client, {prompt: long, wait: false})

      expect(client.prompts).to.have.lengthOf(1)
      expect(client.prompts[0]).to.have.lengthOf(6000)
      expect(client.prompts[0]).to.equal(long)
      expect(validatePrompt(long)).to.equal(long)
    })
  })

  describe('the watch link', () => {
    it('is printed before the stream is opened', async () => {
      const io = recorder()
      let atOpen: string[] = []
      const client = new StubClient({
        frames: [frame(SUCCEEDED)],
        onOpen() {
          atOpen = [...io.outLines]
        },
      })

      await run(client, {io})

      expect(atOpen.join('\n')).to.contain(WATCH_URL)
      expect(client.openedWith).to.have.lengthOf(1)
    })

    it('is printed even when the stream cannot be opened at all, and the run exits non-zero', async () => {
      const io = recorder()
      const client = new StubClient({openError: new Error('ECONNREFUSED')})

      const result = await run(client, {io})

      expect(io.outLines.join('\n')).to.contain(WATCH_URL)
      expect(result.exitCode).to.equal(1)
      expect(client.snapshotCalls).to.equal(1)
    })

    it('degrades to a link-free sentence against a Hatch that predates ?watch=1', async () => {
      const io = recorder()
      const client = new StubClient({frames: [frame(SUCCEEDED)], watchUrl: null})

      const result = await run(client, {io})

      expect(io.outLines[0]).to.contain('No follow-along link')
      expect(result.summary.watchUrl).to.equal(undefined)
      expect(result.exitCode).to.equal(0)
    })
  })

  describe('--no-wait', () => {
    it('prints the link and returns without opening a stream', async () => {
      const io = recorder()
      const client = new StubClient()

      const result = await run(client, {io, wait: false})

      expect(io.outLines.join('\n')).to.contain(WATCH_URL)
      expect(client.openedWith).to.deep.equal([])
      expect(result.exitCode).to.equal(0)
      expect(result.summary.outcome).to.equal('started')
    })
  })

  describe('exit codes', () => {
    it('returns 0 on a terminal succeeded, and prints the site URL', async () => {
      const io = recorder()
      const client = new StubClient({frames: [frame(PHASE), frame(NARRATION), frame(SUCCEEDED)]})

      const result = await run(client, {io})

      expect(result.exitCode).to.equal(0)
      expect(result.summary.outcome).to.equal('succeeded')
      expect(result.summary.siteUrl).to.equal(SITE_URL)
      expect(io.outLines.join('\n')).to.contain(SITE_URL)
      expect(client.snapshotCalls).to.equal(0)
    })

    it('returns non-zero on a terminal failed, and prints why', async () => {
      const io = recorder()
      const client = new StubClient({frames: [frame(PHASE), frame(FAILED)]})

      const result = await run(client, {io})

      expect(result.exitCode).to.equal(1)
      expect(result.summary.outcome).to.equal('failed')
      expect(io.outLines.join('\n')).to.contain('the agent could not build it')
      expect(io.outLines.join('\n')).to.contain(WATCH_URL)
    })
  })

  describe('-o json', () => {
    it('puts exactly one JSON object on stdout on success, and no spinner text', async () => {
      const io = recorder()
      const {calls, spinner} = recordingSpinner()
      const client = new StubClient({frames: [frame(PHASE), frame(NARRATION), frame(SUCCEEDED)]})

      const result = await run(client, {io, json: true, spinner})

      expect(io.outLines).to.have.lengthOf(1)
      expect(JSON.parse(io.outLines[0])).to.deep.equal({
        outcome: 'succeeded',
        sessionId: 'sess-1',
        siteUrl: SITE_URL,
        watchUrl: WATCH_URL,
      })
      expect(calls).to.deep.equal([])
      expect(result.exitCode).to.equal(0)
    })

    it('puts exactly one JSON object on stdout on failure', async () => {
      const io = recorder()
      const client = new StubClient({frames: [frame(FAILED)]})

      const result = await run(client, {io, json: true})

      expect(io.outLines).to.have.lengthOf(1)
      expect(JSON.parse(io.outLines[0])).to.deep.equal({
        message: 'the agent could not build it',
        outcome: 'failed',
        sessionId: 'sess-1',
        watchUrl: WATCH_URL,
      })
      expect(result.exitCode).to.equal(1)
    })

    it('puts the watch link on stderr at t=0, before the stream opens, while stdout is still empty', async () => {
      const io = recorder()
      let stdoutAtOpen: string[] = []
      let stderrAtOpen: string[] = []
      const client = new StubClient({
        frames: [frame(SUCCEEDED)],
        onOpen() {
          stdoutAtOpen = [...io.outLines]
          stderrAtOpen = [...io.errLines]
        },
      })

      await run(client, {io, json: true})

      expect(stdoutAtOpen).to.deep.equal([])
      expect(stderrAtOpen.join('\n')).to.contain(WATCH_URL)
    })
  })

  describe('a non-TTY run', () => {
    it('emits no ANSI and prints each status change as a plain line', async () => {
      const io = recorder()
      const {calls, spinner} = recordingSpinner()
      const client = new StubClient({frames: [frame(PHASE), frame(NARRATION), frame(SUCCEEDED)]})

      await run(client, {animate: false, io, spinner})

      const transcript = io.outLines.join('\n')
      expect(transcript).to.not.contain('\u001B')
      expect(io.outLines).to.include('Queued')
      expect(io.outLines).to.include('Setting up')
      expect(io.outLines).to.include('Setting up — writing the order table')
      expect(calls).to.deep.equal([])
    })
  })

  describe('an interrupt', () => {
    it('prints the link, does not throw, and exits 0', async () => {
      const io = recorder()
      const controller = new AbortController()
      const client = new StubClient({
        frames: [frame(PHASE)],
        keepOpen: true,
        onOpen() {
          setTimeout(() => controller.abort(), 25)
        },
      })

      const result = await run(client, {interrupt: controller.signal, io})

      expect(result.exitCode).to.equal(0)
      expect(result.summary.outcome).to.equal('interrupted')
      expect(io.outLines.join('\n')).to.contain('the build keeps running')
      expect(io.outLines.join('\n')).to.contain(WATCH_URL)
      expect(client.snapshotCalls).to.equal(0)
    })

    it('still emits one stdout object with outcome "interrupted" under -o json', async () => {
      const io = recorder()
      const controller = new AbortController()
      const client = new StubClient({
        frames: [frame(PHASE)],
        keepOpen: true,
        onOpen() {
          setTimeout(() => controller.abort(), 25)
        },
      })

      const result = await run(client, {interrupt: controller.signal, io, json: true})

      expect(io.outLines).to.have.lengthOf(1)
      const summary = JSON.parse(io.outLines[0]) as Record<string, unknown>
      expect(summary.outcome).to.equal('interrupted')
      expect(summary.siteUrl).to.equal(undefined)
      expect(summary.watchUrl).to.equal(WATCH_URL)
      expect(result.exitCode).to.equal(0)
    })
  })

  describe('the snapshot backstop', () => {
    it('takes the outcome from the snapshot when the stream ends with no terminal activity', async () => {
      const io = recorder()
      const client = new StubClient({
        frames: [frame(PHASE)],
        snapshot: {siteUrl: SITE_URL, state: 'succeeded'},
      })

      const result = await run(client, {io})

      expect(client.snapshotCalls).to.equal(1)
      expect(result.exitCode).to.equal(0)
      expect(result.summary.outcome).to.equal('succeeded')
      expect(io.outLines.join('\n')).to.contain(SITE_URL)
    })

    it('does not hang past the wall-clock cap, and reports an expired session from the snapshot', async () => {
      const io = recorder()
      const client = new StubClient({
        frames: [frame(PHASE)],
        keepOpen: true,
        snapshot: {failureMessage: 'The build ran out of time.', state: 'expired'},
      })

      const result = await run(client, {capMs: 25, io})

      expect(client.snapshotCalls).to.equal(1)
      expect(result.exitCode).to.equal(1)
      expect(result.summary.outcome).to.equal('expired')
      expect(io.outLines.join('\n')).to.contain('The build ran out of time.')
      expect(io.outLines.join('\n')).to.contain(WATCH_URL)
    })

    it('fails loudly rather than silently when the session is still in flight', async () => {
      const io = recorder()
      const client = new StubClient({frames: [frame(PHASE)], snapshot: {state: 'building'}})

      const result = await run(client, {io})

      expect(result.exitCode).to.equal(1)
      expect(result.summary.outcome).to.equal('failed')
      expect(io.outLines.join('\n')).to.contain('ended before the build did')
    })

    it('caps the watch at Hatch’s budget plus a documented margin', () => {
      expect(WATCH_CAP_MS).to.be.greaterThan(15 * 60 * 1000)
    })
  })

  describe('--api', () => {
    it('routes every call at the given origin while the printed link comes from the server', async () => {
      const urls: string[] = []
      const fetchImpl = (async (input: unknown, init: {method?: string} = {}) => {
        const url = String(input)
        urls.push(`${init.method ?? 'GET'} ${url}`)

        if (url.endsWith('/api/sessions?watch=1')) {
          return new Response(JSON.stringify({sessionId: 'sess-1', state: 'draft', watchUrl: WATCH_URL}), {
            headers: {'content-type': 'application/json', 'set-cookie': 'hatch_session=abc; Path=/; HttpOnly'},
            status: 201,
          })
        }

        if (url.endsWith('/prompt')) return new Response(null, {status: 202})

        return new Response(streamOf([frame(SUCCEEDED)]), {
          headers: {'content-type': 'text/event-stream'},
          status: 200,
        })
      }) as unknown as typeof fetch

      const io = recorder()
      const client = new HatchClient({
        baseUrl: resolveHatchUrl({flag: 'http://localhost:8080'}),
        fetchImpl,
        version: '1.0.0',
      })

      const result = await run(client, {io})

      expect(urls).to.deep.equal([
        'POST http://localhost:8080/api/sessions?watch=1',
        'POST http://localhost:8080/api/sessions/sess-1/prompt',
        'GET http://localhost:8080/events/sessions/sess-1',
      ])
      expect(io.outLines.join('\n')).to.contain(WATCH_URL)
      expect(result.summary.siteUrl).to.equal(SITE_URL)
      expect(result.exitCode).to.equal(0)
    })
  })

  describe('parseActivity', () => {
    it('parses a JSON data frame', () => {
      expect(parseActivity({data: JSON.stringify(PHASE)})?.kind).to.equal('phase')
    })

    it('ignores a frame whose data is not usable JSON, rather than throwing', () => {
      expect(parseActivity({data: 'not json'})).to.equal(undefined)
      expect(parseActivity({data: ''})).to.equal(undefined)
      expect(parseActivity({data: '"a string"'})).to.equal(undefined)
    })
  })
})
