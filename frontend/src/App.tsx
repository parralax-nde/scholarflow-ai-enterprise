import { FormEvent, useRef, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import ScholarFlowLogo from './ScholarFlowLogo'
import { colors, typography, spacing } from './design-system'
import './App.css'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

type ResearchProject = {
  id: string
  title: string
  description: string
  taskCount: number
  messageCount: number
  lastUpdated: string
  createdAt: string
}

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '/api'
const defaultModel = import.meta.env.VITE_OLLAMA_MODEL ?? 'gemma4:e2b'

export default function App() {
  // Projects & UI state
  const [projects, setProjects] = useState<ResearchProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: 'assistant',
      content:
        '# Welcome to ScholarFlow\n\nAsk me to help with:\n- **Literature synthesis** - Compile and summarize research papers\n- **Citation validation** - Check claims against source materials\n- **Proposal refinement** - Improve research proposals\n\nLet\'s build your research together.',
      timestamp: new Date().toISOString(),
    },
  ])
  const [prompt, setPrompt] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [status, setStatus] = useState(`Ready · ${defaultModel}`)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadProjects = async () => {
    try {
      // Mock projects - in production, fetch from backend
      const mockProjects: ResearchProject[] = [
        {
          id: '1',
          title: 'Transformer Architecture Analysis',
          description: 'Deep dive into attention mechanisms and modern LLM architectures',
          taskCount: 7,
          messageCount: 42,
          lastUpdated: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '2',
          title: 'Literature Review: Retrieval-Augmented Generation',
          description: 'Comprehensive synthesis of RAG techniques and applications',
          taskCount: 5,
          messageCount: 28,
          lastUpdated: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: '3',
          title: 'Fine-tuning vs Prompting: Comparative Study',
          description: 'Evaluate effectiveness of different instruction tuning approaches',
          taskCount: 3,
          messageCount: 15,
          lastUpdated: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]
      setProjects(mockProjects)
      if (!selectedProjectId && mockProjects.length > 0) {
        setSelectedProjectId(mockProjects[0].id)
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  const appendAssistantChunk = (assistantId: string, chunk: string) => {
    setMessages(prev =>
      prev.map(message =>
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
      timestamp: new Date().toISOString(),
    }
    const assistantId = crypto.randomUUID()
    const assistantMessage: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }

    const conversationPayload = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMessage.content },
    ]

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setPrompt('')
    setIsStreaming(true)
    setStatus('Researching...')

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
      inputRef.current?.focus()
    }
  }

  return (
    <div className="app-container">
      {/* LEFT SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-section">
            <ScholarFlowLogo size="md" />
            <div className="logo-text">
              <h1>ScholarFlow</h1>
              <p>Research Copilot</p>
            </div>
          </div>
        </div>

        <button className="new-research-btn">
          <span>+ New Research</span>
        </button>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <h3>Research Projects</h3>
            <div className="projects-list">
              {projects.map(project => (
                <button
                  key={project.id}
                  className={`project-item ${selectedProjectId === project.id ? 'active' : ''}`}
                  onClick={() => setSelectedProjectId(project.id)}
                >
                  <div className="project-title">{project.title}</div>
                  <div className="project-meta">
                    <span className="task-count">{project.taskCount} tasks</span>
                    <span className="message-count">{project.messageCount} msgs</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-section">
            <div className="user-avatar">👤</div>
            <span>Account</span>
          </div>
        </div>
      </aside>

      {/* MIDDLE COLUMN - Project Detail Header */}
      <div className="middle-column">
        {selectedProject ? (
          <div className="project-header">
            <h2>{selectedProject.title}</h2>
            <p className="project-description">{selectedProject.description}</p>
            <div className="project-stats">
              <span>
                📅{' '}
                {new Date(selectedProject.createdAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
              <span>💬 {selectedProject.messageCount} messages</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* RIGHT COLUMN - Chat Interface */}
      <main className="chat-column">
        <div className="chat-header">
          <div className="status-badge">
            <span className="status-dot"></span>
            {status}
          </div>
        </div>

        <div className="messages-container">
          {messages.map(message => (
            <div
              key={message.id}
              className={`message message-${message.role}`}
            >
              {message.role === 'assistant' ? (
                <div className="message-avatar assistant-avatar">🤖</div>
              ) : (
                <div className="message-avatar user-avatar">👤</div>
              )}
              <div className="message-content">
                <ReactMarkdown
                  components={{
                    h1: ({ node, ...props }) => (
                      <h1 style={{ fontSize: '1.5em', marginTop: '0.5em', marginBottom: '0.5em' }} {...props} />
                    ),
                    h2: ({ node, ...props }) => (
                      <h2 style={{ fontSize: '1.25em', marginTop: '0.4em', marginBottom: '0.4em' }} {...props} />
                    ),
                    h3: ({ node, ...props }) => (
                      <h3 style={{ fontSize: '1.1em', marginTop: '0.3em', marginBottom: '0.3em' }} {...props} />
                    ),
                    p: ({ node, ...props }) => <p style={{ margin: '0.5em 0' }} {...props} />,
                    ul: ({ node, ...props }) => (
                      <ul style={{ margin: '0.5em 0', paddingLeft: '1.5em' }} {...props} />
                    ),
                    ol: ({ node, ...props }) => (
                      <ol style={{ margin: '0.5em 0', paddingLeft: '1.5em' }} {...props} />
                    ),
                    code: (props) => <code {...props} />,
                    pre: (props) => (
                      <pre
                        style={{
                          backgroundColor: colors.gray900,
                          color: colors.white,
                          padding: '1em',
                          borderRadius: '0.5em',
                          overflow: 'auto',
                          margin: '0.5em 0',
                        }}
                        {...props}
                      />
                    ),
                    blockquote: ({ node, ...props }) => (
                      <blockquote
                        style={{
                          borderLeft: `4px solid ${colors.primary}`,
                          paddingLeft: '1em',
                          margin: '0.5em 0',
                          color: colors.gray600,
                        }}
                        {...props}
                      />
                    ),
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="message-composer" onSubmit={sendPrompt}>
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Ask about literature synthesis, citation validation, proposal refinement..."
            rows={3}
            disabled={isStreaming}
            onKeyDown={e => {
              if (e.key === 'Enter' && e.ctrlKey) {
                sendPrompt(e as any)
              }
            }}
          />
          <div className="composer-actions">
            <button type="button" className="attach-btn" disabled={isStreaming}>
              📎
            </button>
            <button type="submit" className="send-btn" disabled={isStreaming || !prompt.trim()}>
              {isStreaming ? '⏳' : '→'} {isStreaming ? 'Researching' : 'Send'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
