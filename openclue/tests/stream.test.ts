import { describe, expect, it } from 'vitest'
import { LineSplitter, SSEParser } from '../src/main/llm/stream'

const enc = new TextEncoder()

describe('LineSplitter', () => {
  it('buffers partial lines across chunks', () => {
    const s = new LineSplitter()
    expect(s.push('{"a":1}\n{"b"')).toEqual(['{"a":1}'])
    expect(s.push(':2}\n')).toEqual(['{"b":2}'])
    expect(s.flush()).toEqual([])
  })

  it('handles CRLF and a trailing line without newline', () => {
    const s = new LineSplitter()
    expect(s.push('x\r\ny')).toEqual(['x'])
    expect(s.flush()).toEqual(['y'])
  })

  it('decodes multi-byte UTF-8 split across chunks', () => {
    const s = new LineSplitter()
    const bytes = enc.encode('héllo 👋\n')
    expect(s.push(bytes.slice(0, 2))).toEqual([])
    expect(s.push(bytes.slice(2, 8))).toEqual([])
    expect(s.push(bytes.slice(8))).toEqual(['héllo 👋'])
  })
})

describe('SSEParser', () => {
  it('parses OpenAI-style data events', () => {
    const p = new SSEParser()
    const events = p.push('data: {"x":1}\n\ndata: [DONE]\n\n')
    expect(events.map((e) => e.data)).toEqual(['{"x":1}', '[DONE]'])
  })

  it('parses Anthropic-style named events split across chunks', () => {
    const p = new SSEParser()
    expect(p.push('event: content_block_delta\nda')).toEqual([])
    const events = p.push('ta: {"type":"content_block_delta"}\n\n')
    expect(events).toEqual([{ event: 'content_block_delta', data: '{"type":"content_block_delta"}' }])
  })

  it('joins multi-line data and ignores comments', () => {
    const p = new SSEParser()
    expect(p.push(': ping\ndata: a\ndata: b\n\n')).toEqual([{ event: undefined, data: 'a\nb' }])
  })

  it('flushes a final event without a trailing blank line', () => {
    const p = new SSEParser()
    expect(p.push('data: last')).toEqual([])
    expect(p.flush()).toEqual([{ event: undefined, data: 'last' }])
  })
})
