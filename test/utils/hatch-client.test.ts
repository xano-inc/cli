/* eslint-disable n/no-unsupported-features/node-builtins, no-undef -- fetch/Response/Headers and the RequestInfo/RequestInit types are stable on the Node 20.12 floor this package targets; the rule's support data is stale */
import {expect} from 'chai'

import type {SessionSnapshot} from '../../src/utils/hatch-contract.js'

import {
  HatchClient,
  HatchSessionCookieError,
  outcomeFromSnapshot,
  resolveHatchUrl,
} from '../../src/utils/hatch-client.js'

interface RecordedCall {
  headers: Headers
  init: RequestInit
  method: string
  url: string
}

/** A fetch stand-in that records every call and replays scripted responses. */
function recordingFetch(handler: (call: RecordedCall) => Response): {
  calls: RecordedCall[]
  fetchImpl: typeof fetch
} {
  const calls: RecordedCall[] = []
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const call: RecordedCall = {
      headers: new Headers(init.headers),
      init,
      method: init.method ?? 'GET',
      url: String(input),
    }
    calls.push(call)
    return handler(call)
  }) as unknown as typeof fetch

  return {calls, fetchImpl}
}

function createdResponse(body: Record<string, unknown>, cookie = 'hatch_session=abc123'): Response {
  return new Response(JSON.stringify(body), {
    headers: {'content-type': 'application/json', 'set-cookie': cookie},
    status: 201,
  })
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {'content-type': 'application/json'},
    status,
  })
}

const SNAPSHOT: SessionSnapshot = {
  createdAt: 1_700_000_000_000,
  phase: 'done',
  prompt: 'a bakery site',
  sessionId: 'sess_1',
  siteUrl: 'https://bakery-a91f.xano.io',
  state: 'succeeded',
}

describe('hatch-client', () => {
  describe('resolveHatchUrl', () => {
    it('falls back to the public Hatch origin', () => {
      expect(resolveHatchUrl({})).to.equal('https://hatch.mesh0.ai')
    })

    it('prefers the env var over the default', () => {
      expect(resolveHatchUrl({env: 'https://staging.example.com'})).to.equal('https://staging.example.com')
    })

    it('prefers the flag over the env var', () => {
      expect(resolveHatchUrl({env: 'https://staging.example.com', flag: 'http://localhost:8080'})).to.equal(
        'http://localhost:8080',
      )
    })

    it('ignores an empty flag or env value', () => {
      expect(resolveHatchUrl({env: '', flag: ''})).to.equal('https://hatch.mesh0.ai')
    })

    it('strips trailing slashes so a URL never doubles up', () => {
      expect(resolveHatchUrl({flag: 'http://localhost:8080/'})).to.equal('http://localhost:8080')
      expect(resolveHatchUrl({env: 'https://staging.example.com///'})).to.equal('https://staging.example.com')
    })
  })

  describe('createSession', () => {
    it('posts to /api/sessions?watch=1 and returns the session and watch link', async () => {
      const {calls, fetchImpl} = recordingFetch(() =>
        createdResponse({sessionId: 'sess_1', state: 'draft', watchUrl: 'https://hatch.mesh0.ai/s/K7QM2XPA9RTV'}),
      )
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai', fetchImpl, version: '1.2.3'})

      const created = await client.createSession()

      expect(calls[0].url).to.equal('https://hatch.mesh0.ai/api/sessions?watch=1')
      expect(calls[0].method).to.equal('POST')
      expect(calls[0].headers.get('user-agent')).to.equal('xano-cli/1.2.3')
      expect(created.sessionId).to.equal('sess_1')
      expect(created.watchUrl).to.equal('https://hatch.mesh0.ai/s/K7QM2XPA9RTV')
    })

    it('does not double the slash when the base URL ends in one', async () => {
      const {calls, fetchImpl} = recordingFetch(() => createdResponse({sessionId: 'sess_1', state: 'draft'}))
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai/', fetchImpl, version: '1.2.3'})

      await client.createSession()

      expect(calls[0].url).to.equal('https://hatch.mesh0.ai/api/sessions?watch=1')
    })

    it('accepts a 201 with no watchUrl from an API that predates the feature', async () => {
      const {fetchImpl} = recordingFetch(() => createdResponse({sessionId: 'sess_1', state: 'draft'}))
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai', fetchImpl, version: '1.2.3'})

      const created = await client.createSession()

      expect(created.sessionId).to.equal('sess_1')
      expect(created.watchUrl).to.equal(undefined)
    })

    it('throws a named error when the response carries no session cookie', async () => {
      const {fetchImpl} = recordingFetch(
        () => new Response(JSON.stringify({sessionId: 'sess_1', state: 'draft'}), {status: 201}),
      )
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai', fetchImpl, version: '1.2.3'})

      try {
        await client.createSession()
        expect.fail('expected createSession to throw')
      } catch (error) {
        expect(error).to.be.instanceOf(HatchSessionCookieError)
        expect((error as Error).name).to.equal('HatchSessionCookieError')
      }
    })

    it('surfaces a non-JSON error body readably', async () => {
      const {fetchImpl} = recordingFetch(() => new Response('<html>502 Bad Gateway</html>', {status: 500}))
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai', fetchImpl, version: '1.2.3'})

      try {
        await client.createSession()
        expect.fail('expected createSession to throw')
      } catch (error) {
        const {message} = error as Error
        expect(message).to.contain('500')
        expect(message).to.contain('502 Bad Gateway')
      }
    })
  })

  describe('cookie replay', () => {
    it('replays the captured cookie with its attributes stripped', async () => {
      const {calls, fetchImpl} = recordingFetch((call) =>
        call.url.endsWith('/prompt')
          ? jsonResponse({sessionId: 'sess_1', state: 'queued'}, 202)
          : createdResponse(
              {sessionId: 'sess_1', state: 'draft'},
              'hatch_session=abc123; Path=/; HttpOnly; Max-Age=3600; SameSite=Lax; Secure',
            ),
      )
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai', fetchImpl, version: '1.2.3'})

      await client.createSession()
      await client.submitPrompt('sess_1', 'a bakery site')

      expect(calls[1].headers.get('cookie')).to.equal('hatch_session=abc123')
    })
  })

  describe('submitPrompt', () => {
    it('posts the prompt as JSON and accepts a 202', async () => {
      const {calls, fetchImpl} = recordingFetch((call) =>
        call.url.endsWith('/prompt')
          ? jsonResponse({sessionId: 'sess_1', state: 'queued'}, 202)
          : createdResponse({sessionId: 'sess_1', state: 'draft'}),
      )
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai', fetchImpl, version: '1.2.3'})

      await client.createSession()
      await client.submitPrompt('sess_1', 'a bakery site')

      expect(calls[1].url).to.equal('https://hatch.mesh0.ai/api/sessions/sess_1/prompt')
      expect(calls[1].method).to.equal('POST')
      expect(calls[1].headers.get('content-type')).to.equal('application/json')
      expect(JSON.parse(calls[1].init.body as string)).to.deep.equal({prompt: 'a bakery site'})
    })

    it("surfaces Hatch's message on a 409 rather than a bare status", async () => {
      const {fetchImpl} = recordingFetch((call) =>
        call.url.endsWith('/prompt')
          ? jsonResponse({code: 'prompt_already_submitted', message: 'This session already has a prompt.'}, 409)
          : createdResponse({sessionId: 'sess_1', state: 'draft'}),
      )
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai', fetchImpl, version: '1.2.3'})
      await client.createSession()

      try {
        await client.submitPrompt('sess_1', 'a bakery site')
        expect.fail('expected submitPrompt to throw')
      } catch (error) {
        expect((error as Error).message).to.contain('This session already has a prompt.')
        expect((error as Error).message).to.not.contain('(409)')
      }
    })
  })

  describe('getSnapshot', () => {
    it('returns the parsed snapshot', async () => {
      const {calls, fetchImpl} = recordingFetch((call) =>
        call.url.endsWith('/api/sessions/sess_1')
          ? jsonResponse(SNAPSHOT as unknown as Record<string, unknown>, 200)
          : createdResponse({sessionId: 'sess_1', state: 'draft'}),
      )
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai', fetchImpl, version: '1.2.3'})
      await client.createSession()

      const snapshot = await client.getSnapshot('sess_1')

      expect(calls[1].url).to.equal('https://hatch.mesh0.ai/api/sessions/sess_1')
      expect(calls[1].headers.get('cookie')).to.equal('hatch_session=abc123')
      expect(snapshot).to.deep.equal(SNAPSHOT)
    })
  })

  describe('outcomeFromSnapshot', () => {
    it('maps a succeeded snapshot to the shape a terminal activity produces', () => {
      expect(outcomeFromSnapshot(SNAPSHOT)).to.deep.equal({
        outcome: 'succeeded',
        siteUrl: 'https://bakery-a91f.xano.io',
      })
    })

    it('carries the failure message on a non-success terminal state', () => {
      expect(
        outcomeFromSnapshot({...SNAPSHOT, failureMessage: 'ran out of time', siteUrl: undefined, state: 'expired'}),
      ).to.deep.equal({message: 'ran out of time', outcome: 'expired'})
    })

    it('returns undefined while the build is still in flight', () => {
      expect(outcomeFromSnapshot({...SNAPSHOT, phase: 'backend', siteUrl: undefined, state: 'building'})).to.equal(
        undefined,
      )
    })
  })

  describe('openStream', () => {
    it('opens the session event stream with the captured cookie', async () => {
      const {calls, fetchImpl} = recordingFetch((call) =>
        call.url.includes('/events/')
          ? new Response('', {headers: {'content-type': 'text/event-stream'}, status: 200})
          : createdResponse({sessionId: 'sess_1', state: 'draft'}),
      )
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai', fetchImpl, version: '1.2.3'})
      await client.createSession()

      const response = await client.openStream('sess_1')

      expect(response.status).to.equal(200)
      expect(calls[1].url).to.equal('https://hatch.mesh0.ai/events/sessions/sess_1')
      expect(calls[1].headers.get('cookie')).to.equal('hatch_session=abc123')
      expect(calls[1].headers.get('accept')).to.equal('text/event-stream')
      expect(calls[1].headers.get('last-event-id')).to.equal(null)
    })

    it('resumes with a Last-Event-ID header, not a query parameter', async () => {
      const {calls, fetchImpl} = recordingFetch((call) =>
        call.url.includes('/events/')
          ? new Response('', {headers: {'content-type': 'text/event-stream'}, status: 200})
          : createdResponse({sessionId: 'sess_1', state: 'draft'}),
      )
      const client = new HatchClient({baseUrl: 'https://hatch.mesh0.ai', fetchImpl, version: '1.2.3'})
      await client.createSession()

      await client.openStream('sess_1', 42)

      expect(calls[1].headers.get('last-event-id')).to.equal('42')
      expect(calls[1].url).to.equal('https://hatch.mesh0.ai/events/sessions/sess_1')
      expect(calls[1].url).to.not.contain('from=')
    })
  })
})
