import express from 'express'
import { spawn } from 'node:child_process'

class McpStdioClient {
  constructor() {
    this.proc = null
    this.buffer = Buffer.alloc(0)
    this.nextId = 1
    this.pending = new Map()
    this.initialized = false
    this.initializing = null
    this.queue = Promise.resolve()
  }

  start() {
    if (this.proc && !this.proc.killed) return
    this.proc = spawn('npx', ['-y', '@superdoc-dev/mcp'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    this.proc.stdout.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      this._drainBuffer()
    })

    this.proc.stderr.on('data', () => {
      // MCP server can log to stderr; keep silent unless request fails.
    })

    this.proc.on('exit', () => {
      for (const [, pending] of this.pending) {
        pending.reject(new Error('MCP server exited unexpectedly'))
      }
      this.pending.clear()
      this.proc = null
      this.initialized = false
      this.initializing = null
    })
  }

  async ensureInitialized() {
    if (this.initialized) return
    if (this.initializing) return this.initializing

    this.start()
    this.initializing = (async () => {
      const initResult = await this._request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'scholarflow-mcp-bridge', version: '0.1.0' },
      })
      this._notify('notifications/initialized', {})
      this.initialized = true
      return initResult
    })()

    try {
      await this.initializing
    } finally {
      this.initializing = null
    }
  }

  async callTool(name, args) {
    return this._enqueue(async () => {
      await this.ensureInitialized()
      return this._request('tools/call', {
        name,
        arguments: args ?? {},
      })
    })
  }

  async listTools() {
    return this._enqueue(async () => {
      await this.ensureInitialized()
      return this._request('tools/list', {})
    })
  }

  _enqueue(fn) {
    this.queue = this.queue.then(fn, fn)
    return this.queue
  }

  _notify(method, params) {
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
    }
    this._write(payload)
  }

  _request(method, params) {
    const id = this.nextId++
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request timeout for ${method}`))
      }, 30000)

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })

      this._write(payload)
    })
  }

  _write(payload) {
    if (!this.proc || this.proc.killed || !this.proc.stdin.writable) {
      throw new Error('MCP process is not available')
    }

    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8')
    this.proc.stdin.write(Buffer.concat([header, body]))
  }

  _drainBuffer() {
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return

      const header = this.buffer.slice(0, headerEnd).toString('utf8')
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }

      const length = Number(match[1])
      const frameLength = headerEnd + 4 + length
      if (this.buffer.length < frameLength) return

      const body = this.buffer.slice(headerEnd + 4, frameLength).toString('utf8')
      this.buffer = this.buffer.slice(frameLength)

      let message
      try {
        message = JSON.parse(body)
      } catch {
        continue
      }

      if (typeof message.id !== 'undefined' && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error.message || JSON.stringify(message.error)))
        } else {
          pending.resolve(message.result)
        }
      }
    }
  }
}

function parseToolResult(result) {
  if (!result) return { ok: true, raw: null, parsed: null }
  if (result.isError) {
    const text = Array.isArray(result.content)
      ? result.content.map((item) => item.text || '').join('\n').trim()
      : 'unknown MCP error'
    throw new Error(text || 'unknown MCP error')
  }

  const text = Array.isArray(result.content)
    ? result.content.map((item) => item.text || '').join('\n').trim()
    : ''

  let parsed = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  return { ok: true, raw: result, text, parsed }
}

const app = express()
app.use(express.json({ limit: '2mb' }))

const client = new McpStdioClient()

app.get('/health', async (_req, res) => {
  try {
    const tools = await client.listTools()
    res.json({
      status: 'ok',
      service: 'mcp-bridge',
      initialized: true,
      tool_count: Array.isArray(tools?.tools) ? tools.tools.length : 0,
    })
  } catch (error) {
    res.status(500).json({ status: 'error', detail: error instanceof Error ? error.message : 'unknown' })
  }
})

app.post('/mcp/tools/call', async (req, res) => {
  const { name, arguments: args } = req.body || {}
  if (!name || typeof name !== 'string') {
    res.status(400).json({ detail: 'name is required' })
    return
  }

  try {
    const result = await client.callTool(name, args || {})
    const parsed = parseToolResult(result)
    res.json(parsed)
  } catch (error) {
    res.status(500).json({ detail: error instanceof Error ? error.message : 'tool call failed' })
  }
})

app.post('/superdoc/open', async (req, res) => {
  const { path } = req.body || {}
  if (!path || typeof path !== 'string') {
    res.status(400).json({ detail: 'path is required' })
    return
  }

  try {
    const result = await client.callTool('superdoc_open', { path })
    res.json(parseToolResult(result))
  } catch (error) {
    res.status(500).json({ detail: error instanceof Error ? error.message : 'open failed' })
  }
})

app.post('/superdoc/save', async (req, res) => {
  const { session_id: sessionId, out } = req.body || {}
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ detail: 'session_id is required' })
    return
  }

  try {
    const args = out ? { session_id: sessionId, out } : { session_id: sessionId }
    const result = await client.callTool('superdoc_save', args)
    res.json(parseToolResult(result))
  } catch (error) {
    res.status(500).json({ detail: error instanceof Error ? error.message : 'save failed' })
  }
})

app.post('/superdoc/close', async (req, res) => {
  const { session_id: sessionId } = req.body || {}
  if (!sessionId || typeof sessionId !== 'string') {
    res.status(400).json({ detail: 'session_id is required' })
    return
  }

  try {
    const result = await client.callTool('superdoc_close', { session_id: sessionId })
    res.json(parseToolResult(result))
  } catch (error) {
    res.status(500).json({ detail: error instanceof Error ? error.message : 'close failed' })
  }
})

app.post('/superdoc/create-paragraph', async (req, res) => {
  const { session_id: sessionId, text, suggest } = req.body || {}
  if (!sessionId || typeof sessionId !== 'string' || !text || typeof text !== 'string') {
    res.status(400).json({ detail: 'session_id and text are required' })
    return
  }

  try {
    const result = await client.callTool('superdoc_create', {
      session_id: sessionId,
      type: 'paragraph',
      text,
      suggest: Boolean(suggest),
    })
    res.json(parseToolResult(result))
  } catch (error) {
    res.status(500).json({ detail: error instanceof Error ? error.message : 'create paragraph failed' })
  }
})

const port = Number(process.env.PORT || 8090)
app.listen(port, () => {
  console.log(`mcp-bridge listening on :${port}`)
})
