import { FormEvent, useMemo, useRef, useState } from 'react'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
const defaultModel = import.meta.env.VITE_OLLAMA_MODEL ?? 'gemma4:2b'

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content:
        'ScholarFlow ready. Ask for literature synthesis, citation checks, or proposal rewrites and I will stream results as they are generated.',
    },
  ])
  const [prompt, setPrompt] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [status, setStatus] = useState(`Connected to Ollama · model ${defaultModel}`)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const conversationPayload = useMemo(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages],
  )

  const appendAssistantChunk = (assistantId: string, chunk: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId ? { ...message, content: `${message.content}${chunk}` } : message,
      ),
    )
  }

  const sendPrompt = async (event: FormEvent) => {
    event.preventDefault()
    if (isStreaming || !prompt.trim()) return

    const nextUserMessage: Message = { id: crypto.randomUUID(), role: 'user', content: prompt.trim() }
    const assistantId = crypto.randomUUID()
    const nextAssistantMessage: Message = { id: assistantId, role: 'assistant', content: '' }

    const nextConversation = [...conversationPayload, { role: 'user', content: nextUserMessage.content }]
    setMessages((prev) => [...prev, nextUserMessage, nextAssistantMessage])
    setPrompt('')
    setIsStreaming(true)
    setStatus('Generating with Ollama stream…')

    try {
      const response = await fetch(`${apiBase}/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextConversation }),
      })

      if (!response.ok) {
        appendAssistantChunk(assistantId, 'Request failed. Please retry.')
        setStatus(`Request failed (${response.status})`)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        appendAssistantChunk(assistantId, 'Streaming is unavailable in this browser.')
        setStatus('Streaming unavailable')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let receivedToken = false

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (line) {
            let chunk: { type: string; content?: string; error?: string; model?: string }
            try {
              chunk = JSON.parse(line) as { type: string; content?: string; error?: string; model?: string }
            } catch {
              newlineIndex = buffer.indexOf('\n')
              continue
            }
            if (chunk.type === 'token' && chunk.content) {
              appendAssistantChunk(assistantId, chunk.content)
              receivedToken = true
            }
            if (chunk.type === 'meta' && chunk.model) setStatus(`Connected to Ollama · model ${chunk.model}`)
            if (chunk.type === 'error') setStatus(chunk.error ? `Error: ${chunk.error}` : 'Stream error')
          }
          newlineIndex = buffer.indexOf('\n')
        }
      }

      if (!receivedToken) {
        setStatus('No response received from model')
      } else {
        setStatus('Generation complete')
      }
    } catch (error) {
      appendAssistantChunk(assistantId, 'Unable to reach the AI service.')
      setStatus(error instanceof Error ? `Network error: ${error.message}` : 'Network error')
    } finally {
      setIsStreaming(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ScholarFlow AI Enterprise</p>
          <h1>Research Copilot Conversation</h1>
        </div>
        <div className="model-chip">{defaultModel} · streaming</div>
      </header>

      <main className="chat-layout">
        <aside className="context-panel">
          <h2>Generation Context</h2>
          <p>Conversational drafting pipeline with real-time token streaming from Ollama.</p>
          <ul>
            <li>Model: {defaultModel}</li>
            <li>Transport: NDJSON stream</li>
            <li>Mode: multi-turn proposal generation</li>
          </ul>
          <p className="status">{status}</p>
        </aside>

        <section className="chat-panel" aria-live="polite">
          <div className="messages">
            {messages.map((message) => (
              <article key={message.id} className={`message message-${message.role}`}>
                <p className="message-role">{message.role === 'user' ? 'You' : 'ScholarFlow AI'}</p>
                <p className="message-content">{message.content || (isStreaming ? 'Generating…' : '')}</p>
              </article>
            ))}
          </div>

          <form className="composer" onSubmit={sendPrompt}>
            <label htmlFor="prompt">Ask the model</label>
            <textarea
              ref={inputRef}
              id="prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Generate a literature review that compares transformer-based retrieval approaches."
              rows={4}
              disabled={isStreaming}
            />
            <button type="submit" disabled={isStreaming || !prompt.trim()}>
              {isStreaming ? 'Streaming…' : 'Send'}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
