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
  messageCount: number
  dateLabel: string
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
const defaultModel = import.meta.env.VITE_OLLAMA_MODEL ?? 'gemma4:e2b'

const conversations: Conversation[] = [
  { id: '1', title: 'Building an F1 car.', messageCount: 7, dateLabel: 'Today' },
  { id: '2', title: 'Text Chat Abbreviations Meaning.', messageCount: 3, dateLabel: 'Today' },
  { id: '3', title: 'Open-source alternatives for speech recognition.', messageCount: 11, dateLabel: 'Today' },
  { id: '4', title: 'F1 car design and winners.', messageCount: 11, dateLabel: 'Today' },
  { id: '5', title: "Hummer's Iconic Look", messageCount: 5, dateLabel: 'Today' },
  { id: '6', title: "Description of Earth's Appearance", messageCount: 5, dateLabel: 'Today' },
]

const docxReviewLines = [
  'PALADIN',
  'The process of building an F1 car uses advanced engineering techniques and precision manufacturing.',
  'It starts with computer-aided design, where engineers model aerodynamic surfaces for speed and control.',
  'A lightweight carbon-fiber monocoque forms the center of the car and anchors suspension, power unit, and safety structures.',
  'Teams run wind-tunnel and CFD testing to tune drag, downforce, and cooling efficiency before production.',
  'Final assembly requires close collaboration between designers, race engineers, and specialized technicians.',
]

export default function App() {
  const [activeConversationId, setActiveConversationId] = useState(conversations[0].id)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'sys-1',
      role: 'assistant',
      content:
        'Building an F1 car usually starts with advanced aerodynamic design, material simulations, and iterative prototyping.',
    },
    {
      id: 'usr-1',
      role: 'user',
      content: 'show me what an f1 car looks like',
    },
    {
      id: 'sys-2',
      role: 'assistant',
      content: 'Here is a visual concept and a short explanation of the major body zones and aero elements.',
    },
  ])
  const [prompt, setPrompt] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [status, setStatus] = useState(`Connected · ${defaultModel}`)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0],
    [activeConversationId],
  )

  const appendAssistantChunk = (assistantId: string, chunk: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId
          ? { ...message, content: `${message.content}${chunk}` }
          : message,
      ),
    )
  }

  const sendPrompt = async (event: FormEvent) => {
    event.preventDefault()
    if (isStreaming || !prompt.trim()) return

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt.trim(),
    }
    const assistantId = crypto.randomUUID()
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
    }

    const conversationPayload = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMessage.content },
    ]

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setPrompt('')
    setIsStreaming(true)
    setStatus('Generating...')

    try {
      const response = await fetch(`${apiBase}/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationPayload }),
      })

      if (!response.ok) {
        appendAssistantChunk(assistantId, `\n**Error**: Request failed (${response.status})`)
        setStatus(`Error (${response.status})`)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        appendAssistantChunk(assistantId, '\n**Error**: Streaming unavailable in this browser.')
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
            }
            if (chunk.type === 'meta' && chunk.model) setStatus(`Connected · ${chunk.model}`)
            if (chunk.type === 'error') {
              streamHadError = true
              const errorMessage = chunk.error ? `\n**Error**: ${chunk.error}` : '\n**Error**: Stream error'
              appendAssistantChunk(assistantId, errorMessage)
              setStatus(chunk.error ? `Error: ${chunk.error}` : 'Stream error')
            }
          }
          newlineIndex = buffer.indexOf('\n')
        }
      }

      if (streamHadError) {
        // Keep error status
      } else if (!receivedToken) {
        setStatus('No response received')
      } else {
        setStatus('Research complete')
      }
    } catch (error) {
      appendAssistantChunk(
        assistantId,
        `\n**Error**: ${error instanceof Error ? error.message : 'Network error'}`,
      )
      setStatus(error instanceof Error ? `Error: ${error.message}` : 'Network error')
    } finally {
      setIsStreaming(false)
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }

  return (
    <div className="workspace-shell">
      <div className="workspace-window">
        <header className="browser-bar">
          <div className="traffic-lights">
            <span />
            <span />
            <span />
          </div>
          <div className="address-pill">localhost</div>
        </header>

        <div className="workspace-grid">
          <aside className="conversations-pane">
            <div className="brand-lockup">
              <div className="brand-mark">U</div>
              <div className="brand-copy">
                <strong>UNIS</strong>
              </div>
            </div>

            <button className="profile-chip">@pegasus</button>
            <button className="new-conversation-button">+ NEW CONVERSATION</button>

            <div className="conversation-list">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={`conversation-row ${activeConversationId === conversation.id ? 'active' : ''}`}
                  onClick={() => setActiveConversationId(conversation.id)}
                >
                  <span className="conversation-avatar">OX</span>
                  <div>
                    <div className="conversation-title">{conversation.title}</div>
                    <div className="conversation-meta">
                      {conversation.dateLabel} · {conversation.messageCount} messages
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <main className="chat-pane">
            <div className="chat-titlebar">
              <div className="chat-title-block">
                <p className="chat-label">CONVERSATION</p>
                <h1>{activeConversation.title}</h1>
                <p className="chat-meta">
                  {activeConversation.dateLabel.toUpperCase()} · {activeConversation.messageCount} MESSAGES
                </p>
              </div>
              <button className="archive-button">ARCHIVE</button>
            </div>

            <div className="chat-thread">
              {messages.map((message) => (
                <div key={message.id} className={`chat-message ${message.role}`}>
                  <span className="speaker-tag">{message.role === 'assistant' ? 'PALADIN' : 'YOU'}</span>
                  <div className="bubble">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="composer" onSubmit={sendPrompt}>
              <input
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Message this conversation"
                disabled={isStreaming}
              />
              <button type="submit" disabled={isStreaming || !prompt.trim()}>
                {isStreaming ? 'SENDING…' : 'SEND'}
              </button>
            </form>
            <p className="status-line">{status}</p>
          </main>

          <aside className="docx-pane">
            <div className="docx-header">
              <h2>DOCX REVIEW</h2>
              <span>Draft v3.docx</span>
            </div>
            <div className="docx-paper">
              {docxReviewLines.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
