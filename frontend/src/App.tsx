import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'

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

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
const defaultModel = import.meta.env.VITE_OLLAMA_MODEL ?? 'gemma4:e2b'

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [prompt, setPrompt] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [status, setStatus] = useState(`Connected · ${defaultModel}`)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [conversations, activeConversationId],
  )

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
    setStatus('Generating...')

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
        setStatus('Response ready')
      }
    } catch (error) {
      appendAssistantChunk(
        assistantId,
        `\n**Error**: ${error instanceof Error ? error.message : 'Network error'}`,
      )
      setStatus(error instanceof Error ? `Error: ${error.message}` : 'Network error')
    } finally {
      setIsStreaming(false)
      if (conversationId) {
        await loadConversations(conversationId).catch(() => undefined)
        await loadMessages(conversationId).catch(() => undefined)
      }
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>ScholarFlow</h2>
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
                <div className="conversation-title">{conversation.title || 'New chat'}</div>
                <div className="conversation-meta">{conversation.message_count} messages</div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="chat-pane">
        <header className="chat-header">
          <h1>{activeConversation?.title || 'New chat'}</h1>
          <p className="status-line">{status}</p>
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
                  <ReactMarkdown>{message.content}</ReactMarkdown>
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
            {isStreaming ? 'Sending…' : 'Send'}
          </button>
        </form>
      </main>
    </div>
  )
}
