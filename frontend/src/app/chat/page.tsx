'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppSelector } from 'store/store-hooks';

import RealtimePageFrame from '@/components/realtime/RealtimePageFrame';

type Conversation = {
  id: string;
  title: string;
  updated_at: string;
  message_count: number;
};

type Message = {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api';

export default function ChatPage() {
  const colors = useAppSelector((state) => state.global.colors);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [assistantDraft, setAssistantDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const createConversation = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/ai/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New chat' }),
    });
    if (!response.ok) {
      throw new Error('Unable to create conversation');
    }
    return (await response.json()) as Conversation;
  }, []);

  const loadConversations = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/ai/conversations`);
    if (!response.ok) {
      throw new Error('Unable to load conversations');
    }

    const payload = (await response.json()) as Conversation[];
    if (payload.length === 0) {
      const created = await createConversation();
      setConversations([created]);
      setActiveConversationId(created.id);
      return;
    }

    setConversations(payload);
    setActiveConversationId((prev) => prev ?? payload[0].id);
  }, [createConversation]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const response = await fetch(`${API_BASE_URL}/ai/conversations/${conversationId}/messages`);
    if (!response.ok) {
      throw new Error('Unable to load messages');
    }
    const payload = (await response.json()) as { messages: Message[] };
    setMessages(payload.messages ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadConversations();
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    void (async () => {
      try {
        await loadMessages(activeConversationId);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [activeConversationId, loadMessages]);

  const handleNewConversation = async () => {
    try {
      const created = await createConversation();
      setConversations((prev) => [created, ...prev]);
      setActiveConversationId(created.id);
      setMessages([]);
      setAssistantDraft('');
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeConversationId || isSending) return;

    const userMessage: Message = { role: 'user', content: trimmed, id: `local-${Date.now()}` };
    const outboundMessages = [...messages, userMessage].map((item) => ({
      role: item.role,
      content: item.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAssistantDraft('');
    setError(null);
    setIsSending(true);

    let assistantContent = '';

    try {
      const response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: activeConversationId,
          messages: outboundMessages,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Unable to start streaming response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let streamEnded = false;
      while (!streamEnded) {
        const { done, value } = await reader.read();
        if (done) {
          streamEnded = true;
          continue;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          const event = JSON.parse(line) as { type?: string; content?: string; error?: string };

          if (event.type === 'error') {
            throw new Error(event.error || 'Streaming failed');
          }

          if (event.type === 'token' || event.type === 'agent_delta') {
            const delta = event.content ?? '';
            if (!delta) continue;
            assistantContent += delta;
            setAssistantDraft(assistantContent);
          }
        }
      }

      if (assistantContent.trim()) {
        setMessages((prev) => [...prev, { role: 'assistant', content: assistantContent, id: `assistant-${Date.now()}` }]);
      }

      setAssistantDraft('');
      await loadConversations();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <RealtimePageFrame>
      <section className='grid min-h-[calc(100vh-12rem)] gap-4 lg:grid-cols-[280px_1fr]'>
        <aside className='border p-3' style={{ borderColor: `${colors.secondaryColor.color}66`, backgroundColor: `${colors.secondaryColor.color}1A` }}>
          <button
            type='button'
            className='mb-3 w-full border px-3 py-2 text-sm font-medium'
            style={{ backgroundColor: colors.primaryColor.color as string, color: colors.backgroundColor.color as string, borderColor: colors.primaryColor.color as string }}
            onClick={handleNewConversation}
          >
            New conversation
          </button>

          <div className='max-h-[calc(100vh-19rem)] space-y-2 overflow-y-auto'>
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type='button'
                className='w-full border px-3 py-2 text-left text-sm'
                style={{
                  borderColor: activeConversationId === conversation.id ? colors.accentColor.color as string : `${colors.secondaryColor.color}66`,
                  backgroundColor: activeConversationId === conversation.id ? `${colors.accentColor.color}22` : 'transparent',
                }}
                onClick={() => setActiveConversationId(conversation.id)}
              >
                <p className='truncate font-medium'>{conversation.title}</p>
                <p className='text-xs opacity-75'>{conversation.message_count} messages</p>
              </button>
            ))}
          </div>
        </aside>

        <div className='flex min-h-0 flex-col border' style={{ borderColor: `${colors.secondaryColor.color}66`, backgroundColor: `${colors.secondaryColor.color}0F` }}>
          <header className='border-b px-4 py-3' style={{ borderColor: `${colors.secondaryColor.color}66` }}>
            <h1 className='text-lg font-semibold'>{activeConversation?.title ?? 'Chat'}</h1>
          </header>

          <div className='flex-1 space-y-3 overflow-y-auto px-4 py-4'>
            {messages.map((message) => (
              <article
                key={message.id ?? `${message.role}-${message.content.slice(0, 16)}`}
                className='max-w-[85%] border px-3 py-2 text-sm'
                style={{
                  marginLeft: message.role === 'user' ? 'auto' : 0,
                  borderColor: message.role === 'user' ? `${colors.primaryColor.color}99` : `${colors.secondaryColor.color}66`,
                  backgroundColor: message.role === 'user' ? `${colors.primaryColor.color}22` : `${colors.secondaryColor.color}16`,
                }}
              >
                {message.content}
              </article>
            ))}

            {assistantDraft && (
              <article className='max-w-[85%] border px-3 py-2 text-sm' style={{ borderColor: `${colors.accentColor.color}99`, backgroundColor: `${colors.accentColor.color}16` }}>
                {assistantDraft}
              </article>
            )}
          </div>

          {error && <p className='px-4 pb-2 text-sm text-red-500'>{error}</p>}

          <div className='border-t p-3' style={{ borderColor: `${colors.secondaryColor.color}66` }}>
            <div className='flex gap-2'>
              <input
                className='w-full border bg-transparent px-3 py-2 text-sm outline-none'
                style={{ borderColor: `${colors.secondaryColor.color}80` }}
                placeholder='Ask ScholarFlow AI…'
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                type='button'
                onClick={() => {
                  void handleSend();
                }}
                disabled={isSending}
                className='border px-4 py-2 text-sm font-medium disabled:opacity-60'
                style={{ backgroundColor: colors.primaryColor.color as string, color: colors.backgroundColor.color as string, borderColor: colors.primaryColor.color as string }}
              >
                {isSending ? 'Streaming…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </RealtimePageFrame>
  );
}
