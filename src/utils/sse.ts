/* eslint-disable n/no-unsupported-features/node-builtins -- Web Streams (ReadableStream, TextDecoder) are what fetch bodies are; available since Node 18 */
/* eslint-disable no-await-in-loop -- reading a stream and backing off between reconnects is sequential by definition */

/**
 * A minimal `text/event-stream` reader.
 *
 * Bytes in, `{id, event, data}` out. It knows nothing about oclif, HTTP, or any
 * particular server's payloads: `readSseStream` is a pure transform over a
 * `ReadableStream<Uint8Array>`, and `readSseWithReconnect` drives reconnection
 * through a caller-supplied `open()` rather than doing its own requests. That
 * keeps every test a string fixture.
 */

/** One dispatched server-sent event. */
export interface SseEvent {
  /** The joined `data:` lines, newline-separated. Empty when the event carried none. */
  data: string
  /** The `event:` field, or undefined for the default (unnamed) event type. */
  event?: string
  /**
   * The `id:` field, parsed as a non-negative integer. Non-numeric ids are
   * ignored: this reader's only use for an id is resuming from `Last-Event-ID`,
   * and a caller that cannot order ids cannot resume from them either.
   */
  id?: number
}

/** Consecutive fruitless reconnects tolerated before giving up. */
export const DEFAULT_MAX_ATTEMPTS = 5

/** 500ms, doubling, capped at 8s: 500, 1000, 2000, 4000, 8000. */
export function defaultBackoffMs(attempt: number): number {
  return Math.min(500 * 2 ** (attempt - 1), 8000)
}

export interface ReconnectOptions {
  /** Backoff before reconnect attempt `n` (1-based). Defaults to {@link defaultBackoffMs}. */
  backoffMs?: (attempt: number) => number
  /**
   * Whether this event ends the stream. Supplied by the caller so this module
   * stays free of any particular protocol's terminal shape. A close that
   * follows a terminal event is normal completion, not a drop.
   */
  isTerminal: (event: SseEvent) => boolean
  /** Consecutive fruitless reconnects tolerated. Defaults to {@link DEFAULT_MAX_ATTEMPTS}. */
  maxAttempts?: number
  /**
   * Called once per reconnect attempt, before the backoff. Required for any UI
   * that would otherwise look hung: a drop is invisible while the connection is
   * down, so this is the only signal the caller can render.
   */
  onReconnecting?: (attempt: number) => void
  /**
   * Opens (or reopens) the stream. `lastEventId` is the highest id seen so far
   * and must be sent as the `Last-Event-ID` **header** — servers commonly ignore
   * a query parameter, which silently replays the stream from the beginning.
   */
  open: (lastEventId?: number) => Promise<ReadableStream<Uint8Array>>
  /** Injectable so tests do not actually sleep. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Accumulates the fields of one event until a blank line dispatches it.
 *
 * Kept separate from the byte plumbing so the framing rules — comments, field
 * splitting, multi-line data — read as a unit and are testable through the
 * generator with plain strings.
 */
class FrameAccumulator {
  private dataLines: string[] = []
  private eventId: number | undefined
  private eventName: string | undefined
  private sawField = false

  /** Feeds one line; returns an event when that line completed one. */
  push(line: string): SseEvent | undefined {
    // A blank line dispatches. A leading colon marks a comment — servers use
    // those to hold an idle connection open (`: keep-alive`), and treating them
    // as events would emit garbage on a quiet stream.
    if (line === '') return this.dispatch()
    if (line.startsWith(':')) return undefined

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    switch (field) {
      case 'data': {
        this.dataLines.push(value)
        this.sawField = true
        break
      }

      case 'event': {
        this.eventName = value
        this.sawField = true
        break
      }

      case 'id': {
        if (/^\d+$/.test(value)) this.eventId = Number(value)
        this.sawField = true
        break
      }

      // `retry:` and anything unrecognized are not this reader's business.
      default:
    }

    return undefined
  }

  private dispatch(): SseEvent | undefined {
    if (!this.sawField) return undefined

    const event: SseEvent = {data: this.dataLines.join('\n'), event: this.eventName, id: this.eventId}
    this.dataLines = []
    this.eventName = undefined
    this.eventId = undefined
    this.sawField = false
    return event
  }
}

/**
 * Parses a `text/event-stream` body into events.
 *
 * Decodes UTF-8 incrementally, so a multi-byte character split across a chunk
 * boundary survives. Handles `\n` and `\r\n`. A trailing partial event at
 * end-of-stream is discarded — an event is only dispatched on a blank line.
 *
 * @yields each parsed event, in arrival order.
 */
export async function* readSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder('utf8')
  const frames = new FrameAccumulator()
  let buffer = ''

  try {
    for (;;) {
      let chunk
      try {
        chunk = await reader.read()
      } catch (error) {
        throw new Error(`failed to read event stream: ${errorMessage(error)}`)
      }

      if (chunk.done) break
      buffer += decoder.decode(chunk.value, {stream: true})

      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')

        const event = frames.push(line)
        if (event) yield event
      }
    }
  } finally {
    // Cancel rather than release: an early `break` by the consumer (on a
    // terminal event, say) must close the underlying connection, not leak it.
    await reader.cancel().catch(() => {})
  }
}

/** An already-closed stream, used to route a failed reopen through the same retry accounting. */
function closedStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })
}

/**
 * Reads a stream to its terminal event, reopening across unexpected closes.
 *
 * Tracks the highest id seen and hands it to `open()` so the caller can resume
 * with `Last-Event-ID`. A close that follows a terminal event completes
 * normally; any other close is a drop, reported through `onReconnecting` and
 * retried after a backoff.
 *
 * The attempt budget counts *consecutive fruitless* reopens: a reopen that
 * delivers at least one event resets it, so a long-running stream survives many
 * drops while a dead endpoint still fails fast. Callers that need an absolute
 * ceiling should impose their own wall-clock cap on top of this.
 *
 * @yields each parsed event, up to and including the terminal one.
 */
export async function* readSseWithReconnect(options: ReconnectOptions): AsyncGenerator<SseEvent> {
  const {
    backoffMs = defaultBackoffMs,
    isTerminal,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    onReconnecting,
    open,
    sleep = defaultSleep,
  } = options

  let stream: ReadableStream<Uint8Array>
  try {
    stream = await open()
  } catch (error) {
    throw new Error(`failed to open event stream: ${errorMessage(error)}`)
  }

  let lastEventId: number | undefined
  let attempt = 0
  let reopenError: unknown

  for (;;) {
    let progressed = false
    let terminated = false

    for await (const event of readSseStream(stream)) {
      if (event.id !== undefined && (lastEventId === undefined || event.id > lastEventId)) {
        lastEventId = event.id
      }

      progressed = true
      yield event

      if (isTerminal(event)) {
        terminated = true
        break
      }
    }

    if (terminated) return

    if (progressed) attempt = 0
    attempt += 1

    if (attempt > maxAttempts) {
      const cause = reopenError ? `: ${errorMessage(reopenError)}` : ''
      throw new Error(
        `event stream closed before a terminal event and did not recover after ${maxAttempts} reconnect attempts${cause}`,
      )
    }

    onReconnecting?.(attempt)
    await sleep(backoffMs(attempt))

    try {
      stream = await open(lastEventId)
      reopenError = undefined
    } catch (error) {
      // Reopening failed. Substitute an empty stream so the next pass through
      // the loop charges this against the same attempt budget as a close does.
      reopenError = error
      stream = closedStream()
    }
  }
}
