import { FormEvent, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type Conversation = {
  id: string
  title: string
  timestamp: number
  messageCount: number
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
const defaultModel = import.meta.env.VITE_OLLAMA_MODEL ?? 'gemma4:e2b'

const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1',
    title: 'Building an F1 car design framework',
    timestamp: Date.now() - 86400000 * 2,
    messageCount: 7,
  },
  {
    id: 'conv-2',
    title: 'Text synthesis with embeddings',
    timestamp: Date.now() - 86400000,
    messageCount: 5,
  },
  {
    id: 'conv-3',
    title: 'Voice transcription models',
    timestamp: Date.now() - 86400000 * 0.5,
    messageCount: 8,
  },
  {
    id: 'conv-4',
    title: 'Open-source alternatives comparison',
    timestamp: Date.now() - 3600000,
    messageCount: 11,
  },
]

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'sys-0',
      role: 'assistant',
      content: `# Research Copilot Ready

I'm **ScholarFlow AI**—your research assistant for:
- **Literature synthesis** across academic domains
- **Citation mapping** and validation
- **Proposal drafting** with academic rigor
- **Methodology review** and critique
- **Statistical analysis** explanations

Start by asking me about any research topic, and I'll help you synthesize knowledge, validate claims, and refine your academic work.`,
    },
  ])
  const [prompt, setPrompt] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [status, setStatus] = useState(`Connected to ${defaultModel}`)
  const [currentConversationId, setCurrentConversationId] = useState<string>('new')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const conversationPayload = useMemo(
    () =>
      messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    [messages],
  )

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

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
    setStatus('Generating…')

    try {
      const response = await fetch(`${apiBase}/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextConversation }),
      })

      if (!response.ok) {
        appendAssistantChunk(assistantId, `**Error**: Request failed (${response.status}). Please try again.`)
        setStatus(`Failed (${response.status})`)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        appendAssistantChunk(
          assistantId,
          '**Error**: Streaming unavailable. Your browser may not support ReadableStream.',
        )
        setStatus('Streaming unavailable')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let receivedToken = false
      let streamHadError = false

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
              chunk = JSON.parse(line)
            } catch {
              newlineIndex = buffer.indexOf('\n')
              continue
            }

            if (chunk.type === 'token' && chunk.content) {
              appendAssistantChunk(assistantId, chunk.content)
              receivedToken = true
            } else if (chunk.type === 'meta' && chunk.model) {
              setStatus(`Connected to ${chunk.model}`)
            } else if (chunk.type === 'error') {
              streamHadError = true
              const errorMsg = chunk.error || 'Stream error'
              appendAssistantChunk(assistantId, `\n\n**Error**: ${errorMsg}`)
              setStatus(`Error: ${errorMsg}`)
            }
          }

          newlineIndex = buffer.indexOf('\n')
        }
      }

      scrollToBottom()

      if (streamHadError) {
        // Keep error status
      } else if (!receivedToken) {
        setStatus('No response received')
      } else {
        setStatus('Ready')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'
      appendAssistantChunk(assistantId, `**Error**: Unable to reach AI service. ${msg}`)
      setStatus('Connection failed')
    } finally {
      setIsStreaming(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="app-layout">
      {/* LEFT SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="app-branding">
            <div className="logo-circle">SF</div>
            <div>
              <div className="app-name">ScholarFlow</div>
              <div className="app-subtitle">Research AI</div>
            </div>
          </div>
        </div>

        <button className="new-research-btn">
          <span className="plus-icon">+</span>
          New Research
        </button>

        <div className="conversations-list">
          <div className="section-label">Recent Conversations</div>
          {SAMPLE_CONVERSATIONS.map((conv) => (
            <button
              key={conv.id}
              className={`conversation-item ${currentConversationId === conv.id ? 'active' : ''}`}
              onClick={() => setCurrentConversationId(conv.id)}
            >
              <div className="conv-title">{conv.title}</div>
              <div className="conv-meta">{conv.messageCount} messages</div>
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="sidebar-nav-item">⚙️ Settings</button>
          <button className="sidebar-nav-item">❓ Help</button>
        </div>
      </aside>

      {/* CENTER CHAT PANEL */}
      <main className="chat-container">
        <div className="chat-header">
          <h1>Research Assistant</h1>
        </div>

        <div className="messages-viewport">
          {messages.map((message) => (
            <div key={message.id} className={`message message-${message.role}`}>
              <div className="message-wrapper">
                <div className="message-avatar">
                  {message.role === 'user' ? '👤' : '🔬'}
                </div>
                <div className="message-content">
                  {message.role === 'assistant' ? (
                    <ReactMarkdown
                      components={{
                        h1: (props) => <h1 className="md-h1">{props.children}</h1>,
                        h2: (props) => <h2 className="md-h2">{props.children}</h2>,
                        h3: (props) => <h3 className="md-h3">{props.children}</h3>,
                        p: (props) => <p className="md-p">{props.children}</p>,
                        ul: (props) => <ul className="md-ul">{props.children}</ul>,
                        ol: (props) => <ol className="md-ol">{props.children}</ol>,
                        li: (props) => <li className="md-li">{props.children}</li>,
                        code: (props: any) => 
                          props.inline ? (
                            <code className="md-code-inline">{props.children}</code>
                          ) : (
                            <code className="md-code-block">{props.children}</code>
                          ),
                        blockquote: (props) => <blockquote className="md-blockquote">{props.children}</blockquote>,
                        a: (props) => <a className="md-link" href={props.href}>{props.children}</a>,
                      }}
                    >
                      {message.content || (isStreaming ? '_Generating response…_' : '')}
                    </ReactMarkdown>
                  ) : (
                    <p className="message-text">{message.content}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {isStreaming && !messages[messages.length - 1]?.content && (
            <div className="status-indicator">
              <div className="spinner"></div>
              <span>{status}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="composer" onSubmit={sendPrompt}>
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask about literature synthesis, citation validation, proposal refinement, or research methodology…"
            disabled={isStreaming}
            rows={3}
            className="composer-input"
          />
          <div className="composer-footer">
            <span className="status-text">{status}</span>
            <button type="submit" disabled={isStreaming || !prompt.trim()} className="send-button">
              {isStreaming ? 'Generating…' : 'Send'}
            </button>
          </div>
        </form>
      </main>

      {/* RIGHT PANEL */}
      <aside className="research-panel">
        <div className="panel-section">
          <h3>Research Capabilities</h3>
          <ul className="capability-list">
            <li>📚 Literature synthesis</li>
            <li>✓ Citation validation</li>
            <li>📝 Proposal refinement</li>
            <li>🔬 Methodology review</li>
            <li>📊 Statistical guidance</li>
            <li>📖 Academic writing assistance</li>
          </ul>
        </div>

        <div className="panel-section">
          <h3>Model Info</h3>
          <div className="model-badge">
            <div className="badge-label">Model</div>
            <div className="badge-value">{defaultModel}</div>
          </div>
          <div className="model-badge">
            <div className="badge-label">Transport</div>
            <div className="badge-value">Streaming NDJSON</div>
          </div>
          <div className="model-badge">
            <div className="badge-label">Mode</div>
            <div className="badge-value">Multi-turn</div>
          </div>
        </div>

        <div className="panel-section">
          <h3>Tips</h3>
          <ul className="tips-list">
            <li>Be specific about your research domain</li>
            <li>Ask for citations and sources</li>
            <li>Request methodology critiques</li>
            <li>Use follow-ups to refine responses</li>
          </ul>
        </div>
      </aside>
    </div>
  )
}
