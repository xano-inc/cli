/* eslint-disable n/no-unsupported-features/node-builtins, no-undef -- fetch/Response/Headers and the RequestInit type are stable on the Node 20.12 floor this package targets; the rule's support data is stale, and src/base-command.ts hits the same false positives */

/**
 * A minimal HTTP client for the Hatch API.
 *
 * Deliberately free of oclif: it takes its `fetch` and its version string as
 * options so it is unit-testable without a network or a command instance.
 * Hatch authenticates an anonymous session purely by the signed cookie handed
 * back from session-create, so this client's only state is that cookie.
 */

import type {BuildOutcome, CreateSessionResponse, SessionSnapshot} from './hatch-contract.js'

import {isTerminalOutcome} from './hatch-contract.js'

/** Where `xano hatch` talks to when nothing else says otherwise. */
export const DEFAULT_HATCH_URL = 'https://hatch.mesh0.ai'

/** The env var that points the command at a local API or a staging droplet. */
export const HATCH_URL_ENV_VAR = 'XANO_HATCH_URL'

/**
 * Resolve the Hatch origin: `--api` flag > `XANO_HATCH_URL` > the default.
 *
 * Trailing slashes are stripped here rather than at each call site, so no
 * request ever ends up asking for `//api/sessions`.
 */
export function resolveHatchUrl(source: {env?: string; flag?: string}): string {
  const chosen = source.flag?.trim() || source.env?.trim() || DEFAULT_HATCH_URL
  return chosen.replace(/\/+$/, '')
}

/**
 * Session-create answered without a `Set-Cookie`. Named because every later
 * call would otherwise 404 or 403 with no hint of the real cause.
 */
export class HatchSessionCookieError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HatchSessionCookieError'
  }
}

export interface HatchClientOptions {
  /** Origin only, no trailing slash — see `resolveHatchUrl`. */
  baseUrl: string
  fetchImpl?: typeof fetch
  /** Reported as `xano-cli/<version>`; passed in so oclif stays out of here. */
  version: string
}

/**
 * Derive how a build ended from its snapshot, in the same shape a `terminal`
 * activity carries — so the command's stream path and its snapshot backstop
 * agree on what "done" looks like. Undefined while the build is in flight.
 */
export function outcomeFromSnapshot(snapshot: SessionSnapshot): BuildOutcome | undefined {
  if (!isTerminalOutcome(snapshot.state)) return undefined

  return {
    ...(snapshot.failureMessage === undefined ? {} : {message: snapshot.failureMessage}),
    outcome: snapshot.state,
    ...(snapshot.siteUrl === undefined ? {} : {siteUrl: snapshot.siteUrl}),
  }
}

export class HatchClient {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  /** The `name=value` pair captured from session-create. */
  private sessionCookie: string | undefined
  private readonly userAgent: string

  constructor(options: HatchClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
    this.userAgent = `xano-cli/${options.version}`
  }

  /**
   * Mint an anonymous session, asking for a watch link.
   *
   * `watchUrl` is optional on purpose: a Hatch deployed before the `?watch=1`
   * affordance answers without one, and the command degrades to watching
   * without a link rather than failing.
   */
  async createSession(): Promise<CreateSessionResponse> {
    const response = await this.request(`${this.baseUrl}/api/sessions?watch=1`, {method: 'POST'})
    if (!response.ok) {
      throw new Error(await describeFailure(response, 'failed to start a Hatch session'))
    }

    const cookie = extractSessionCookie(response)
    if (!cookie) {
      throw new HatchSessionCookieError(
        'failed to start a Hatch session: the server returned no session cookie, so the build could not be claimed',
      )
    }

    this.sessionCookie = cookie
    return (await parseJson(response, 'failed to start a Hatch session')) as CreateSessionResponse
  }

  /** `GET /api/sessions/:id` — the backstop when the stream says nothing. */
  async getSnapshot(sessionId: string): Promise<SessionSnapshot> {
    const response = await this.request(`${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}`, {
      headers: {accept: 'application/json'},
      method: 'GET',
    })
    if (!response.ok) {
      throw new Error(await describeFailure(response, 'failed to read the Hatch session'))
    }

    return (await parseJson(response, 'failed to read the Hatch session')) as SessionSnapshot
  }

  /**
   * Open the session's SSE stream, returning the raw `Response` for a reader
   * to frame.
   *
   * `lastEventId` goes in the `Last-Event-ID` **header**. Hatch's frontend also
   * appends `?from=<n>`, but the server reads only the header — sending the
   * query parameter alone silently replays the whole build on every reconnect.
   */
  async openStream(sessionId: string, lastEventId?: number | string): Promise<Response> {
    const headers: Record<string, string> = {accept: 'text/event-stream'}
    if (lastEventId !== undefined) {
      headers['Last-Event-ID'] = String(lastEventId)
    }

    const response = await this.request(`${this.baseUrl}/events/sessions/${encodeURIComponent(sessionId)}`, {
      headers,
      method: 'GET',
    })
    if (!response.ok) {
      throw new Error(await describeFailure(response, 'failed to open the Hatch build stream'))
    }

    return response
  }

  /** `POST /api/sessions/:id/prompt` — the server answers 202. */
  async submitPrompt(sessionId: string, prompt: string): Promise<void> {
    const response = await this.request(`${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
      body: JSON.stringify({prompt}),
      headers: {accept: 'application/json', 'content-type': 'application/json'},
      method: 'POST',
    })

    if (!response.ok) {
      throw new Error(await describeFailure(response, 'failed to submit the prompt'))
    }
  }

  /** Every request carries the User-Agent, and the cookie once we hold one. */
  private async request(url: string, init: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'User-Agent': this.userAgent,
      ...(init.headers as Record<string, string> | undefined),
    }
    if (this.sessionCookie) {
      headers.Cookie = this.sessionCookie
    }

    try {
      return await this.fetchImpl(url, {...init, headers})
    } catch (error) {
      throw new Error(`failed to reach Hatch at ${url}: ${(error as Error).message}`)
    }
  }
}

/**
 * Unwrap Hatch's `{code, message}` error envelope. A non-JSON body (a proxy's
 * HTML error page, say) still has to read as something, so it is appended
 * under the status line rather than swallowed.
 */
async function describeFailure(response: Response, context: string): Promise<string> {
  const body = await response.text().catch(() => '')

  try {
    const parsed = JSON.parse(body) as {message?: string}
    if (parsed?.message) return `${context}: ${parsed.message}`
  } catch {
    // Not JSON — fall through to the status-plus-body form below.
  }

  return body ? `${context} (${response.status})\n${body}` : `${context} (${response.status})`
}

/** Read a `Set-Cookie`, keeping only the `name=value` pair. */
function extractSessionCookie(response: Response): string | undefined {
  const raw = response.headers.getSetCookie?.()[0] ?? response.headers.get('set-cookie')
  const pair = raw?.split(';')[0]?.trim()
  return pair || undefined
}

async function parseJson(response: Response, context: string): Promise<unknown> {
  const body = await response.text()
  try {
    return JSON.parse(body)
  } catch (error) {
    throw new Error(`${context}: the server returned a non-JSON response (${(error as Error).message})`)
  }
}
