// Minimal fake Ollama (+ whisper.cpp server) used by the smoke test. No real model needed.
import { createServer } from 'node:http'

export function startFakeBackends(port = 0) {
  const requests = []
  const server = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    requests.push({ method: req.method, url: req.url, body })

    if (req.url === '/api/tags') {
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ models: [{ name: 'qwen2.5vl:7b' }, { name: 'llama3.1:8b' }] }))
    }
    if (req.url === '/api/show') {
      const { model } = JSON.parse(body || '{}')
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ capabilities: model?.includes('vl') ? ['completion', 'vision'] : ['completion'] }))
    }
    if (req.url === '/api/chat') {
      const payload = JSON.parse(body)
      const last = payload.messages[payload.messages.length - 1]
      const sawImage = Array.isArray(last.images) && last.images.length > 0
      const parts = [
        '## Answer\n\n',
        sawImage ? 'I can see your **screenshot**. ' : 'No screenshot attached. ',
        'Here is some code:\n\n```python\nprint("hello")\n```\n\n',
        '- one\n- two\n'
      ]
      res.setHeader('Content-Type', 'application/x-ndjson')
      for (const p of parts) {
        res.write(JSON.stringify({ message: { role: 'assistant', content: p }, done: false }) + '\n')
        await new Promise((r) => setTimeout(r, 120))
      }
      res.end(JSON.stringify({ message: { role: 'assistant', content: '' }, done: true }) + '\n')
      return
    }
    if (req.url === '/inference') {
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ text: ' How do I reverse a linked list? ' }))
    }
    res.statusCode = 404
    res.end('{"error":"not found"}')
  })
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, requests, port: server.address().port }))
  })
}
