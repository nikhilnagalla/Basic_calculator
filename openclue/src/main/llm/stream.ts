// Incremental parsers for streamed HTTP bodies. No Electron imports: unit-tested directly.

/** Splits a byte/text stream into lines, buffering partial lines across chunks. */
export class LineSplitter {
  private buffer = ''
  private decoder = new TextDecoder()

  push(chunk: Uint8Array | string): string[] {
    this.buffer += typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true })
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ''
    return lines
  }

  flush(): string[] {
    const rest = this.buffer + this.decoder.decode()
    this.buffer = ''
    return rest.length > 0 ? [rest] : []
  }
}

export interface SSEEvent {
  event?: string
  data: string
}

/** Minimal Server-Sent Events parser (https://html.spec.whatwg.org/multipage/server-sent-events.html). */
export class SSEParser {
  private lines = new LineSplitter()
  private event: string | undefined
  private data: string[] = []

  push(chunk: Uint8Array | string): SSEEvent[] {
    return this.consume(this.lines.push(chunk))
  }

  flush(): SSEEvent[] {
    const events = this.consume(this.lines.flush())
    return [...events, ...this.dispatch()]
  }

  private consume(lines: string[]): SSEEvent[] {
    const out: SSEEvent[] = []
    for (const line of lines) {
      if (line === '') {
        out.push(...this.dispatch())
        continue
      }
      if (line.startsWith(':')) continue
      const idx = line.indexOf(':')
      const field = idx === -1 ? line : line.slice(0, idx)
      let value = idx === -1 ? '' : line.slice(idx + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'event') this.event = value
      else if (field === 'data') this.data.push(value)
    }
    return out
  }

  private dispatch(): SSEEvent[] {
    if (this.data.length === 0) {
      this.event = undefined
      return []
    }
    const ev: SSEEvent = { event: this.event, data: this.data.join('\n') }
    this.event = undefined
    this.data = []
    return [ev]
  }
}

/** Iterate over a fetch Response body chunk by chunk, honouring an AbortSignal. */
export async function* iterateBody(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  const reader = body.getReader()
  try {
    while (true) {
      if (signal?.aborted) return
      const { done, value } = await reader.read()
      if (done) return
      if (value) yield value
    }
  } finally {
    reader.releaseLock()
  }
}
