import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { SuperDocEditor } from '@superdoc-dev/react'
import '@superdoc-dev/react/style.css'
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
  const COLLAPSED_SIDEBAR_WIDTH = 60
  const RESIZER_WIDTH = 10
  const MIN_SIDEBAR_WIDTH = 220
  const MIN_CHAT_WIDTH = 420
  const MIN_REVIEW_WIDTH = 280

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
  const [docxJson, setDocxJson] = useState('')
  const [docxTemplateXml, setDocxTemplateXml] = useState('')
  const [docxResolvedXml, setDocxResolvedXml] = useState('')
  const [docxDownloadUrl, setDocxDownloadUrl] = useState('')
  const [docxViewerPath, setDocxViewerPath] = useState('')
  const [docxFilename, setDocxFilename] = useState('scholarflow-draft.docx')
  const [docxError, setDocxError] = useState('')
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false)
  const [isDraftingDocx, setIsDraftingDocx] = useState(false)
  const [leftPaneWidth, setLeftPaneWidth] = useState(280)
  const [rightPaneWidth, setRightPaneWidth] = useState(360)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [activeResizer, setActiveResizer] = useState<'left' | 'right' | null>(null)
  const [isCompactLayout, setIsCompactLayout] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false,
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const lastDocxDraftSeedRef = useRef('')

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [conversations, activeConversationId],
  )
  const showReviewPane =
    isDraftingDocx ||
    isGeneratingDocx ||
    Boolean(docxDownloadUrl) ||
    Boolean(docxViewerPath) ||
    Boolean(docxError)

  const superDocDocumentUrl = useMemo(() => {
    if (!docxDownloadUrl) return ''
    return docxDownloadUrl.startsWith('http')
      ? docxDownloadUrl
      : `${window.location.origin}${docxDownloadUrl}`
  }, [docxDownloadUrl])

  const streamElapsedMs = useMemo(() => {
    if (!streamStartedAt) return 0
    return Date.now() - streamStartedAt
  }, [streamStartedAt, streamTick])

  useEffect(() => {
    if (!isStreaming) return
    const interval = setInterval(() => setStreamTick((prev) => prev + 1), 250)
    return () => clearInterval(interval)
  }, [isStreaming])

  useEffect(() => {
    if (!activeResizer) return

    const handleMouseMove = (event: MouseEvent) => {
      const layout = layoutRef.current
      if (!layout) return

      const rect = layout.getBoundingClientRect()
      const visibleSidebarWidth = isSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : leftPaneWidth
      const maxLeft = Math.max(
        MIN_SIDEBAR_WIDTH,
        showReviewPane
          ? rect.width - rightPaneWidth - MIN_CHAT_WIDTH - RESIZER_WIDTH * 2
          : rect.width - MIN_CHAT_WIDTH - RESIZER_WIDTH,
      )
      const maxRight = Math.max(
        MIN_REVIEW_WIDTH,
        rect.width - visibleSidebarWidth - MIN_CHAT_WIDTH - RESIZER_WIDTH * 2,
      )

      if (activeResizer === 'left' && !isSidebarCollapsed) {
        const proposedLeft = event.clientX - rect.left
        const clampedLeft = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxLeft, proposedLeft))
        setLeftPaneWidth(clampedLeft)
      }

      if (activeResizer === 'right' && showReviewPane) {
        const proposedRight = rect.right - event.clientX
        const clampedRight = Math.max(MIN_REVIEW_WIDTH, Math.min(maxRight, proposedRight))
        setRightPaneWidth(clampedRight)
      }
    }

    const handleMouseUp = () => setActiveResizer(null)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [
    activeResizer,
    isSidebarCollapsed,
    leftPaneWidth,
    rightPaneWidth,
    showReviewPane,
    COLLAPSED_SIDEBAR_WIDTH,
    MIN_SIDEBAR_WIDTH,
    MIN_CHAT_WIDTH,
    MIN_REVIEW_WIDTH,
    RESIZER_WIDTH,
  ])

  useEffect(() => {
    const onResize = () => setIsCompactLayout(window.innerWidth <= 900)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (isCompactLayout) setActiveResizer(null)
  }, [isCompactLayout])

  useEffect(() => {
    if (!showReviewPane && activeResizer === 'right') setActiveResizer(null)
  }, [showReviewPane, activeResizer])

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
              if (chunk.phase === 'requesting') setStatus(`Requesting model runtime · ${chunk.model}`)
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
    if (!docxTemplateXml.trim() || !docxJson.trim()) return
    setDocxError('')
    setIsGeneratingDocx(true)
    try {
      const parsedJson = JSON.parse(docxJson) as Record<string, unknown>
      const payload = {
        template_xml: docxTemplateXml,
        json_data: parsedJson,
        filename: docxFilename,
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
        filename: string
      }
      setDocxFilename(sessionData.filename)
      setDocxDownloadUrl(`${apiBase}/export/docx/files/${sessionData.docx_id}`)
      setDocxViewerPath(sessionData.viewer_path)
    } catch (error) {
      setDocxError(error instanceof Error ? error.message : 'Could not generate DOCX')
    } finally {
      setIsGeneratingDocx(false)
    }
  }

  const generateDocxDraftViaTool = async () => {
    if (messages.length === 0) return

    setDocxError('')
    setIsDraftingDocx(true)
    try {
      const response = await fetch(`${apiBase}/ai/mcp/tools/docx/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConversationId || undefined,
          current_template_xml: docxTemplateXml || undefined,
          current_json_data: docxJson.trim() ? JSON.parse(docxJson) : undefined,
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
        }),
      })

      if (!response.ok) {
        throw new Error(`DOCX draft tool failed (${response.status})`)
      }

      const draftData = (await response.json()) as {
        template_xml: string
        json_data: Record<string, unknown>
        filename: string
      }

      setDocxTemplateXml(draftData.template_xml)
      setDocxJson(JSON.stringify(draftData.json_data, null, 2))
      setDocxFilename(draftData.filename || 'scholarflow-draft.docx')
    } catch (error) {
      setDocxError(error instanceof Error ? error.message : 'Could not draft DOCX content from AI tool')
    } finally {
      setIsDraftingDocx(false)
    }
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      void generateDocx()
    }, 900)
    return () => clearTimeout(handle)
  }, [docxJson, docxTemplateXml, docxFilename])

  useEffect(() => {
    if (isStreaming || isLoadingMessages || messages.length === 0) return
    const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant' && message.content.trim())
    if (!latestAssistant) return

    const seed = `${activeConversationId}:${latestAssistant.id}`
    if (lastDocxDraftSeedRef.current === seed) return
    lastDocxDraftSeedRef.current = seed

    void generateDocxDraftViaTool()
  }, [messages, isStreaming, isLoadingMessages, activeConversationId])

  const effectiveLeftWidth = isSidebarCollapsed ? COLLAPSED_SIDEBAR_WIDTH : leftPaneWidth
  const layoutStyle = isCompactLayout
    ? undefined
    : showReviewPane
      ? {
          gridTemplateColumns: `${effectiveLeftWidth}px ${RESIZER_WIDTH}px minmax(${MIN_CHAT_WIDTH}px, 1fr) ${RESIZER_WIDTH}px ${rightPaneWidth}px`,
        }
      : {
          gridTemplateColumns: `${effectiveLeftWidth}px ${RESIZER_WIDTH}px minmax(${MIN_CHAT_WIDTH}px, 1fr)`,
        }

  return (
    <div ref={layoutRef} className={`app-layout ${activeResizer ? 'is-resizing' : ''}`} style={layoutStyle}>
      <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-title-row">
            {!isSidebarCollapsed && <h2>ScholarFlow Archives</h2>}
            <button
              type="button"
              className="collapse-sidebar-button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              aria-label={isSidebarCollapsed ? 'Expand conversations panel' : 'Collapse conversations panel'}
              title={isSidebarCollapsed ? 'Expand panel' : 'Collapse panel'}
            >
              <span className={`collapse-sidebar-icon ${isSidebarCollapsed ? 'collapsed' : ''}`} aria-hidden="true" />
            </button>
          </div>
          {!isSidebarCollapsed && (
            <>
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
            </>
          )}
        </div>
        {!isSidebarCollapsed && (
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
        )}
      </aside>

      {!isCompactLayout && (
        <div
          className={`pane-resizer ${isSidebarCollapsed ? 'disabled' : ''}`}
          role="separator"
          aria-label="Resize conversations panel"
          aria-orientation="vertical"
          onMouseDown={() => {
            if (!isSidebarCollapsed) setActiveResizer('left')
          }}
        />
      )}

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

      {!isCompactLayout && showReviewPane && (
        <div
          className="pane-resizer"
          role="separator"
          aria-label="Resize DOCX review panel"
          aria-orientation="vertical"
          onMouseDown={() => setActiveResizer('right')}
        />
      )}

      {showReviewPane && (
        <aside className="review-pane superdoc-only-pane">
          {superDocDocumentUrl ? (
            <SuperDocEditor
              key={superDocDocumentUrl}
              className="superdoc-frame"
              style={{ height: '100%' }}
              document={superDocDocumentUrl}
              documentMode="editing"
              role="editor"
              contained
            />
          ) : docxViewerPath ? (
            <iframe
              className="docx-viewer-frame"
              src={docxViewerPath}
              title="DOCX online preview"
            />
          ) : (
            <div className="superdoc-loading" />
          )}
        </aside>
      )}
    </div>
  )
}
