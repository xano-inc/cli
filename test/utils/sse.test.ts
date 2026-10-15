/* eslint-disable n/no-unsupported-features/node-builtins -- Web Streams are what fetch bodies are; available since Node 18 */
import {expect} from 'chai'

import {readSseStream, readSseWithReconnect, type SseEvent} from '../../src/utils/sse.js'

/** Builds a ReadableStream that emits the given chunks in order, then closes. */
function streamOf(...chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const queued = chunks.map((chunk) => (typeof chunk === 'string' ? encoder.encode(chunk) : chunk))
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= queued.length) {
        controller.close()
        return
      }

      controller.enqueue(queued[index])
      index += 1
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SseEvent[]> {
  const events: SseEvent[] = []
  for await (const event of readSseStream(stream)) events.push(event)
  return events
}

const isTerminal = (event: SseEvent): boolean => event.event === 'terminal'

const noSleep = async (): Promise<void> => {}

describe('sse', () => {
  describe('readSseStream', () => {
    it('parses a well-formed event with id, event and data', async () => {
      const events = await collect(streamOf('id: 7\nevent: activity\ndata: {"kind":"phase"}\n\n'))

      expect(events).to.have.lengthOf(1)
      expect(events[0]).to.deep.equal({data: '{"kind":"phase"}', event: 'activity', id: 7})
    })

    it('yields one identical event when it arrives split across three chunks', async () => {
      const whole = 'id: 7\nevent: activity\ndata: {"kind":"phase"}\n\n'
      const split = await collect(streamOf('id: 7\neve', 'nt: activity\ndata: {"kind":"ph', 'ase"}\n\n'))

      expect(split).to.have.lengthOf(1)
      expect(split).to.deep.equal(await collect(streamOf(whole)))
    })

    it('decodes a multi-byte character split across a chunk boundary', async () => {
      // "✓" is e2 9c 93 — the split falls between the first and second byte.
      const bytes = new TextEncoder().encode('data: ✓ done\n\n')
      const boundary = bytes.indexOf(0xe2) + 1

      const events = await collect(streamOf(bytes.slice(0, boundary), bytes.slice(boundary)))

      expect(events).to.have.lengthOf(1)
      expect(events[0].data).to.equal('✓ done')
    })

    it('drops comment frames such as ": open" and ": keep-alive"', async () => {
      const events = await collect(streamOf(': open\n\n', ': keep-alive\n\n', ': keep-alive\n\n'))

      expect(events).to.deep.equal([])
    })

    it('yields two events from a single chunk, in order', async () => {
      const events = await collect(streamOf('id: 1\ndata: first\n\nid: 2\ndata: second\n\n'))

      expect(events.map((event) => event.data)).to.deep.equal(['first', 'second'])
      expect(events.map((event) => event.id)).to.deep.equal([1, 2])
    })

    it('discards a trailing partial event at end-of-stream', async () => {
      const events = await collect(streamOf('id: 1\ndata: first\n\nid: 2\ndata: partia'))

      expect(events).to.have.lengthOf(1)
      expect(events[0].data).to.equal('first')
    })

    it('discards a complete-looking event that was never followed by a blank line', async () => {
      const events = await collect(streamOf('id: 1\ndata: first\n'))

      expect(events).to.deep.equal([])
    })

    it(String.raw`parses \r\n line endings identically to \n`, async () => {
      const crlf = await collect(streamOf('id: 7\r\nevent: activity\r\ndata: hello\r\n\r\n'))

      expect(crlf).to.deep.equal(await collect(streamOf('id: 7\nevent: activity\ndata: hello\n\n')))
    })

    it('joins multiple data lines with a newline', async () => {
      const events = await collect(streamOf('data: one\ndata: two\n\n'))

      expect(events[0].data).to.equal('one\ntwo')
    })

    it('strips exactly one leading space from a field value', async () => {
      const events = await collect(streamOf('data:  padded\n\n'))

      expect(events[0].data).to.equal(' padded')
    })

    it('ignores unknown fields and non-numeric ids', async () => {
      const events = await collect(streamOf('retry: 1000\nid: abc\ndata: hello\n\n'))

      expect(events).to.have.lengthOf(1)
      expect(events[0].id).to.equal(undefined)
      expect(events[0].data).to.equal('hello')
    })
  })

  describe('readSseWithReconnect', () => {
    it('reopens with the highest id seen when the stream ends without a terminal event', async () => {
      const opened: Array<number | undefined> = []
      const streams = [
        streamOf('id: 1\ndata: a\n\nid: 2\ndata: b\n\n'),
        streamOf('id: 3\nevent: terminal\ndata: c\n\n'),
      ]

      const events: SseEvent[] = []
      for await (const event of readSseWithReconnect({
        isTerminal,
        async open(lastEventId) {
          opened.push(lastEventId)
          return streams.shift()!
        },
        sleep: noSleep,
      })) {
        events.push(event)
      }

      expect(opened).to.deep.equal([undefined, 2])
      expect(events.map((event) => event.id)).to.deep.equal([1, 2, 3])
    })

    it('stops after the bounded attempt count and surfaces an error', async () => {
      let opens = 0
      const attempts: number[] = []
      const seen: SseEvent[] = []

      let error: unknown
      try {
        for await (const event of readSseWithReconnect({
          isTerminal,
          maxAttempts: 3,
          onReconnecting: (attempt) => attempts.push(attempt),
          async open() {
            opens += 1
            return streamOf()
          },
          sleep: noSleep,
        })) {
          seen.push(event)
        }
      } catch (error_) {
        error = error_
      }

      expect(error).to.be.instanceOf(Error)
      expect((error as Error).message).to.contain('3')
      expect(attempts).to.deep.equal([1, 2, 3])
      expect(seen).to.deep.equal([])
      expect(opens).to.equal(4) // the first open plus three reconnects
    })

    it('does not reconnect when the stream ends after a terminal event', async () => {
      let opens = 0
      const events: SseEvent[] = []

      for await (const event of readSseWithReconnect({
        isTerminal,
        async open() {
          opens += 1
          return streamOf('id: 1\ndata: a\n\nid: 2\nevent: terminal\ndata: done\n\n')
        },
        sleep: noSleep,
      })) {
        events.push(event)
      }

      expect(opens).to.equal(1)
      expect(events.map((event) => event.event)).to.deep.equal([undefined, 'terminal'])
    })

    it('stops reading at the terminal event even if more frames follow it', async () => {
      const events: SseEvent[] = []

      for await (const event of readSseWithReconnect({
        isTerminal,
        async open() {
          return streamOf('id: 1\nevent: terminal\ndata: done\n\nid: 2\ndata: after\n\n')
        },
        sleep: noSleep,
      })) {
        events.push(event)
      }

      expect(events).to.have.lengthOf(1)
    })

    it('reports each reopen attempt and reports nothing more once a reopen succeeds', async () => {
      const attempts: number[] = []
      const streams = [streamOf(), streamOf(), streamOf('id: 9\nevent: terminal\ndata: done\n\n')]

      const events: SseEvent[] = []
      for await (const event of readSseWithReconnect({
        isTerminal,
        onReconnecting: (attempt) => attempts.push(attempt),
        async open() {
          return streams.shift()!
        },
        sleep: noSleep,
      })) {
        events.push(event)
      }

      expect(attempts).to.deep.equal([1, 2])
      expect(events).to.have.lengthOf(1)
    })

    it('backs off between attempts using the injected delay', async () => {
      const slept: number[] = []
      const seen: SseEvent[] = []
      const streams = [streamOf(), streamOf(), streamOf('event: terminal\ndata: done\n\n')]

      for await (const event of readSseWithReconnect({
        backoffMs: (attempt) => attempt * 100,
        isTerminal,
        async open() {
          return streams.shift()!
        },
        async sleep(ms) {
          slept.push(ms)
        },
      })) {
        seen.push(event)
      }

      expect(seen).to.have.lengthOf(1)
      expect(slept).to.deep.equal([100, 200])
    })

    it('resets the attempt budget once a reopened stream delivers events', async () => {
      const attempts: number[] = []
      // Two fruitless closes with a productive stream between them: the budget
      // of one would be exhausted if delivered events did not reset it.
      const streams = [streamOf(), streamOf('id: 1\ndata: a\n\n'), streamOf('id: 2\nevent: terminal\ndata: done\n\n')]

      const events: SseEvent[] = []
      for await (const event of readSseWithReconnect({
        isTerminal,
        maxAttempts: 1,
        onReconnecting: (attempt) => attempts.push(attempt),
        async open() {
          return streams.shift()!
        },
        sleep: noSleep,
      })) {
        events.push(event)
      }

      expect(attempts).to.deep.equal([1, 1])
      expect(events.map((event) => event.id)).to.deep.equal([1, 2])
    })

    it('retries a failing reopen and names the underlying cause when the budget runs out', async () => {
      const seen: SseEvent[] = []
      let error: unknown
      try {
        for await (const event of readSseWithReconnect({
          isTerminal,
          maxAttempts: 2,
          async open(lastEventId) {
            if (lastEventId === undefined) return streamOf('id: 4\ndata: a\n\n')
            throw new Error('socket hang up')
          },
          sleep: noSleep,
        })) {
          seen.push(event)
        }
      } catch (error_) {
        error = error_
      }

      expect(seen.map((event) => event.id)).to.deep.equal([4])
      expect((error as Error).message).to.contain('socket hang up')
    })

    it('wraps a failure to open the first stream with context', async () => {
      const seen: SseEvent[] = []
      let error: unknown
      try {
        for await (const event of readSseWithReconnect({
          isTerminal,
          async open() {
            throw new Error('ECONNREFUSED')
          },
          sleep: noSleep,
        })) {
          seen.push(event)
        }
      } catch (error_) {
        error = error_
      }

      expect(seen).to.deep.equal([])
      expect((error as Error).message).to.contain('failed to open event stream')
      expect((error as Error).message).to.contain('ECONNREFUSED')
    })
  })
})
