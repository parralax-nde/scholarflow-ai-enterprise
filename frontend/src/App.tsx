import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type Conversation = {
  id: string
  title: string
  message_count: number
  updated_at: string
}

type ConversationMessagesResponse = {
  conversation_id: string
  messages: Array<{
    id: string
    role: 'user' | 'assistant'
    content: string
    created_at: string
  }>
}

type StreamPhase =
  | 'idle'
  | 'sending'
  | 'waiting-first-token'
  | 'streaming'
  | 'saving'
  | 'done'
  | 'error'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
const defaultModel = import.meta.env.VITE_OLLAMA_MODEL ?? 'gemma4:e2b'
const NEW_CHAT_TITLE = 'New chat'

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [status, setStatus] = useState(`Connected · ${defaultModel}`)
  const [streamPhase, setStreamPhase] = useState<StreamPhase>('idle')
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null)
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null)
  const [firstTokenAt, setFirstTokenAt] = useState<number | null>(null)
  const [streamTick, setStreamTick] = useState(0)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [docxJson, setDocxJson] = useState('{\n  "title": "Research Brief",\n  "author": { "name": "Dr. Jane Doe" },\n  "body": "Summarize key findings here."\n}')
  const [docxTemplateXml, setDocxTemplateXml] = useState(
    '<doc>\n  <h1>{{title}}</h1>\n  <p>Author: {{author.name}}</p>\n  <p>{{body}}</p>\n</doc>',
  )
  const [docxResolvedXml, setDocxResolvedXml] = useState('')
  const [docxDownloadUrl, setDocxDownloadUrl] = useState('')
  const [docxViewerPath, setDocxViewerPath] = useState('')
  const [docxError, setDocxError] = useState('')
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [conversations, activeConversationId],
  )

  const streamElapsedMs = useMemo(() => {
    if (!streamStartedAt) return 0
    return Date.now() - streamStartedAt
  }, [streamStartedAt, streamTick])

  useEffect(() => {
    if (!isStreaming) return
    const interval = setInterval(() => setStreamTick((prev) => prev + 1), 250)
    return () => clearInterval(interval)
  }, [isStreaming])

  const loadConversations = async (preferredId?: string) => {
    const response = await fetch(`${apiBase}/ai/conversations`)
    if (!response.ok) throw new Error(`Failed to load conversations (${response.status})`)
    const data = (await response.json()) as Conversation[]
    setConversations(data)
    if (data.length === 0) {
      setActiveConversationId('')
      return
    }
    setActiveConversationId((currentId) => {
      if (preferredId && data.some((conversation) => conversation.id === preferredId)) return preferredId
      if (currentId && data.some((conversation) => conversation.id === currentId)) return currentId
      return data[0].id
    })
  }

  const loadMessages = async (conversationId: string) => {
    setIsLoadingMessages(true)
    try {
      const response = await fetch(`${apiBase}/ai/conversations/${conversationId}/messages`)
      if (!response.ok) throw new Error(`Failed to load messages (${response.status})`)
      const data = (await response.json()) as ConversationMessagesResponse
      setMessages(data.messages)
    } finally {
      setIsLoadingMessages(false)
    }
  }

  const createConversation = async () => {
    const response = await fetch(`${apiBase}/ai/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!response.ok) throw new Error(`Failed to create conversation (${response.status})`)
    const conversation = (await response.json()) as Conversation
    await loadConversations(conversation.id)
    setMessages([])
    return conversation.id
  }

  useEffect(() => {
    const bootstrap = async () => {
      setIsLoadingConversations(true)
      try {
        await loadConversations()
      } catch (error) {
        setStatus(error instanceof Error ? `Error: ${error.message}` : 'Failed to load conversations')
      } finally {
        setIsLoadingConversations(false)
      }
    }
    void bootstrap()
  }, [])

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([])
      return
    }
    void loadMessages(activeConversationId).catch((error) => {
      setStatus(error instanceof Error ? `Error: ${error.message}` : 'Failed to load messages')
    })
  }, [activeConversationId])

  useEffect(() => {
    if (!isStreaming) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isStreaming])

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

    let conversationId = activeConversationId
    if (!conversationId) {
      try {
        conversationId = await createConversation()
      } catch (error) {
        setStatus(error instanceof Error ? `Error: ${error.message}` : 'Could not create conversation')
        return
      }
    }

    const conversationPayload = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMessage.content },
    ]

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setPrompt('')
    setIsStreaming(true)
    setStreamPhase('sending')
    setStreamingAssistantId(assistantId)
    setStreamStartedAt(Date.now())
    setFirstTokenAt(null)
    setStatus(`Sending request · ${defaultModel}`)

    try {
      const response = await fetch(`${apiBase}/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, messages: conversationPayload }),
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
        setStreamPhase('error')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let receivedToken = false
      let streamHadError = false
      setStreamPhase('waiting-first-token')
      setStatus(`Waiting for first token · ${defaultModel}`)

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newlineIndex = buffer.indexOf('\n')
        while (newlineIndex >= 0) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (line) {
            let chunk: { type: string; content?: string; error?: string; model?: string; phase?: string }
            try {
              chunk = JSON.parse(line)
            } catch {
              newlineIndex = buffer.indexOf('\n')
              continue
            }
            if (chunk.type === 'token' && chunk.content) {
              if (!receivedToken) {
                setFirstTokenAt(Date.now())
                setStreamPhase('streaming')
              }
              appendAssistantChunk(assistantId, chunk.content)
              receivedToken = true
            }
            if (chunk.type === 'meta' && chunk.model) {
              if (chunk.phase === 'queued') setStatus(`Queued in model runtime · ${chunk.model}`)
              if (chunk.phase === 'streaming' && !receivedToken) {
                setStatus(`Model engaged · waiting token · ${chunk.model}`)
              }
              if (!chunk.phase) setStatus(`Connected · ${chunk.model}`)
            }
            if (chunk.type === 'error') {
              streamHadError = true
              const errorMessage = chunk.error ? `\n**Error**: ${chunk.error}` : '\n**Error**: Stream error'
              appendAssistantChunk(assistantId, errorMessage)
              setStatus(chunk.error ? `Error: ${chunk.error}` : 'Stream error')
              setStreamPhase('error')
            }
          }
          newlineIndex = buffer.indexOf('\n')
        }
      }

      if (streamHadError) {
        // Keep error status
      } else if (!receivedToken) {
        setStatus('No response received')
        setStreamPhase('error')
      } else {
        setStatus('Response ready')
        setStreamPhase('done')
      }
    } catch (error) {
      appendAssistantChunk(
        assistantId,
        `\n**Error**: ${error instanceof Error ? error.message : 'Network error'}`,
      )
      setStatus(error instanceof Error ? `Error: ${error.message}` : 'Network error')
      setStreamPhase('error')
    } finally {
      setStreamPhase((prev) => (prev === 'error' ? 'error' : 'saving'))
      setIsStreaming(false)
      if (conversationId) {
        await loadConversations(conversationId).catch((error) => {
          setStatus(error instanceof Error ? `Error: ${error.message}` : 'Failed to refresh conversations')
        })
        await loadMessages(conversationId).catch((error) => {
          setStatus(error instanceof Error ? `Error: ${error.message}` : 'Failed to refresh messages')
        })
      }
      setStreamingAssistantId(null)
      setStreamStartedAt(null)
      setFirstTokenAt(null)
      setStreamPhase((prev) => (prev === 'error' ? 'error' : 'idle'))
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }

  const streamHint = useMemo(() => {
    if (!isStreaming) return null
    const elapsedSeconds = (streamElapsedMs / 1000).toFixed(1)
    if (streamPhase === 'sending') return `Sending request... ${elapsedSeconds}s`
    if (streamPhase === 'waiting-first-token') return `Model thinking... ${elapsedSeconds}s`
    if (streamPhase === 'streaming') {
      if (!firstTokenAt || !streamStartedAt) return `Streaming... ${elapsedSeconds}s`
      const firstTokenLatency = ((firstTokenAt - streamStartedAt) / 1000).toFixed(1)
      return `Streaming now · first token in ${firstTokenLatency}s`
    }
    if (streamPhase === 'saving') return 'Saving response in conversation history...'
    return null
  }, [isStreaming, streamElapsedMs, streamPhase, firstTokenAt, streamStartedAt])

  const generateDocx = async () => {
    setDocxError('')
    setIsGeneratingDocx(true)
    try {
      const parsedJson = JSON.parse(docxJson) as Record<string, unknown>
      const payload = {
        template_xml: docxTemplateXml,
        json_data: parsedJson,
        filename: 'scholarflow-draft.docx',
      }

      const previewResponse = await fetch(`${apiBase}/export/docx/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!previewResponse.ok) {
        throw new Error(`Preview failed (${previewResponse.status})`)
      }

      const previewData = (await previewResponse.json()) as {
        resolved_xml: string
      }
      setDocxResolvedXml(previewData.resolved_xml)

      const sessionResponse = await fetch(`${apiBase}/export/docx/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!sessionResponse.ok) {
        throw new Error(`DOCX session failed (${sessionResponse.status})`)
      }

      const sessionData = (await sessionResponse.json()) as {
        docx_id: string
        viewer_path: string
      }
      setDocxDownloadUrl(`${apiBase}/export/docx/files/${sessionData.docx_id}`)
      setDocxViewerPath(sessionData.viewer_path)
    } catch (error) {
      setDocxError(error instanceof Error ? error.message : 'Could not generate DOCX')
    } finally {
      setIsGeneratingDocx(false)
    }
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      void generateDocx()
    }, 900)
    return () => clearTimeout(handle)
  }, [docxJson, docxTemplateXml])

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>ScholarFlow Archives</h2>
          <p className="sidebar-subtitle">Conversations</p>
          <button
            type="button"
            className="new-conversation-button"
            onClick={() => {
              void createConversation().catch((error) => {
                setStatus(error instanceof Error ? `Error: ${error.message}` : 'Could not create conversation')
              })
            }}
          >
            New chat
          </button>
        </div>
        <div className="conversation-list">
          {isLoadingConversations ? (
            <p className="empty-state">Loading chats...</p>
          ) : conversations.length === 0 ? (
            <p className="empty-state">No chats yet.</p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`conversation-row ${activeConversationId === conversation.id ? 'active' : ''}`}
                onClick={() => setActiveConversationId(conversation.id)}
              >
                <div className="conversation-title">{conversation.title || NEW_CHAT_TITLE}</div>
                <div className="conversation-meta">{conversation.message_count} messages</div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="chat-pane">
        <header className="chat-header">
          <h1>{activeConversation?.title || NEW_CHAT_TITLE}</h1>
          <p className="status-line">{status}</p>
          {streamHint && (
            <div className="stream-progress" role="status" aria-live="polite">
              <span className="progress-dot" />
              <span>{streamHint}</span>
            </div>
          )}
        </header>

        <div className="chat-thread">
          {isLoadingMessages ? (
            <p className="empty-state">Loading messages...</p>
          ) : messages.length === 0 ? (
            <p className="empty-state">Start a conversation.</p>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`chat-message ${message.role}`}>
                <span className="speaker-tag">{message.role === 'assistant' ? 'Assistant' : 'You'}</span>
                <div className="bubble">
                  {message.content ? (
                    <>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                      {isStreaming && streamingAssistantId === message.id && (
                        <span className="typing-cursor" aria-label="assistant is typing" />
                      )}
                    </>
                  ) : isStreaming && streamingAssistantId === message.id ? (
                    <div className="typing-indicator" aria-label="assistant is typing">
                      <span className="typing-face">(o_-) </span>
                      <span className="typing-text">scribbling a draft</span>
                      <span className="typing-cursor" />
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="composer" onSubmit={sendPrompt}>
          <input
            ref={inputRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type your message"
            disabled={isStreaming}
          />
          <button type="submit" disabled={isStreaming || !prompt.trim()}>
            {isStreaming ? 'Working…' : 'Send'}
          </button>
        </form>
      </main>

      <aside className="review-pane">
        <div className="review-header">
          <h2>DOCX Preview</h2>
          <p>Fill JSON fields and XML template, then generate a real DOCX and preview.</p>
        </div>
        <section className="review-card">
          <h3>JSON Fields</h3>
          <textarea
            className="docx-input"
            value={docxJson}
            onChange={(event) => setDocxJson(event.target.value)}
            spellCheck={false}
          />
        </section>
        <section className="review-card">
          <h3>XML Template</h3>
          <textarea
            className="docx-input"
            value={docxTemplateXml}
            onChange={(event) => setDocxTemplateXml(event.target.value)}
            spellCheck={false}
          />
        </section>
        <section className="review-card">
          <button type="button" className="docx-generate-btn" onClick={() => void generateDocx()} disabled={isGeneratingDocx}>
            {isGeneratingDocx ? 'Auto-generating...' : 'Regenerate Now'}
          </button>
          {docxDownloadUrl && (
            <a href={docxDownloadUrl} download="scholarflow-draft.docx" className="docx-download-link">
              Download DOCX
            </a>
          )}
          {docxError && <p className="docx-error">{docxError}</p>}
        </section>
        <section className="review-card">
          <h3>Resolved XML</h3>
          <pre className="resolved-xml">{docxResolvedXml || 'No preview yet.'}</pre>
        </section>
        <section className="review-card">
          <h3>Online Viewer</h3>
          {docxViewerPath ? (
            <iframe
              className="docx-viewer-frame"
              src={docxViewerPath}
              title="DOCX online preview"
            />
          ) : (
            <div className="docx-preview-surface"><p>No preview yet.</p></div>
          )}
        </section>
      </aside>
    </div>
  )
}
