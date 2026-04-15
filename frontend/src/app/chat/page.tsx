'use client';

import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppSelector } from 'store/store-hooks';

import { toApiUrl } from '@/lib/api';
import { readAuthSession } from '@/lib/auth';

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

type DocxSession = {
  docx_id: string;
  filename: string;
  viewer_path: string;
};

type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'free' | 'enterprise' | string;
};

type StreamingEvent = {
  type?: string;
  content?: string;
  error?: string;
  conversation_id?: string;
  template_id?: string;
  template_xml?: string;
  json_data?: Record<string, unknown>;
  filename?: string;
};
type StreamPhase = 'idle' | 'thinking' | 'typing';
type DocxTemplate = {
  id: string;
  name: string;
  description: string;
  fields: string[];
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeError = (err: unknown) => {
  const message = (err as Error)?.message || 'Unknown error';
  if (/http2_protocol_error/i.test(message)) {
    return 'Streaming transport was interrupted (HTTP/2 protocol error). Please retry the request.';
  }
  if (/failed to fetch/i.test(message)) {
    return 'Failed to fetch service. Confirm backend/API gateway is reachable.';
  }
  return message;
};

export default function ChatPage() {
  const colors = useAppSelector((state) => state.global.colors);

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [assistantDraft, setAssistantDraft] = useState('');
  const [streamPhase, setStreamPhase] = useState<StreamPhase>('idle');
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingDocx, setIsGeneratingDocx] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestMessageUsed, setGuestMessageUsed] = useState(false);
  const [docxSession, setDocxSession] = useState<DocxSession | null>(null);
  const [docxTemplates, setDocxTemplates] = useState<DocxTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('research_brief');
  const [templateXml, setTemplateXml] = useState<string>('');
  const [templateJsonDraft, setTemplateJsonDraft] = useState<string>('');
  const [jsonStreamDraft, setJsonStreamDraft] = useState<string>('');
  const [docxRefreshKey, setDocxRefreshKey] = useState(0);

  const isAuthenticated = Boolean(authUser);

  useEffect(() => {
    const session = readAuthSession();
    setAuthUser((session?.user as AuthUser) ?? null);
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((item) => item.role === 'assistant')?.content ?? '',
    [messages]
  );

  const createConversation = useCallback(async () => {
    const response = await fetch(toApiUrl('/ai/conversations'), {
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
    const response = await fetch(toApiUrl('/ai/conversations'));
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
    const response = await fetch(toApiUrl(`/ai/conversations/${conversationId}/messages`));
    if (!response.ok) {
      throw new Error('Unable to load messages');
    }
    const payload = (await response.json()) as { messages: Message[] };
    setMessages(payload.messages ?? []);
    setGuestMessageUsed(
      (payload.messages ?? []).some((message) => message.role === 'user')
    );
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadConversations();
      } catch (err) {
        setError(normalizeError(err));
      }
    })();
  }, [loadConversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    void (async () => {
      try {
        await loadMessages(activeConversationId);
      } catch (err) {
        setError(normalizeError(err));
      }
    })();
  }, [activeConversationId, loadMessages]);

  const loadDocxTemplates = useCallback(async () => {
    const response = await fetch(toApiUrl('/ai/docx/templates'));
    if (!response.ok) {
      throw new Error('Unable to load DOCX templates');
    }
    const payload = (await response.json()) as { templates: DocxTemplate[] };
    const templates = payload.templates ?? [];
    setDocxTemplates(templates);
    if (!templates.some((template) => template.id === selectedTemplateId) && templates[0]) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedTemplateId]);

  const loadTemplateDetails = useCallback(async (templateId: string) => {
    const response = await fetch(toApiUrl(`/ai/docx/templates/${templateId}`));
    if (!response.ok) {
      throw new Error('Unable to load DOCX template details');
    }
    const payload = (await response.json()) as {
      template_id: string;
      template_xml: string;
      default_json_data: Record<string, unknown>;
    };
    setTemplateXml(payload.template_xml);
    setTemplateJsonDraft(JSON.stringify(payload.default_json_data, null, 2));
    setJsonStreamDraft('');
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadDocxTemplates();
      } catch (err) {
        setError(normalizeError(err));
      }
    })();
  }, [loadDocxTemplates]);

  useEffect(() => {
    if (!selectedTemplateId) return;
    void (async () => {
      try {
        await loadTemplateDetails(selectedTemplateId);
      } catch (err) {
        setError(normalizeError(err));
      }
    })();
  }, [loadTemplateDetails, selectedTemplateId]);

  const handleNewConversation = async () => {
    if (!isAuthenticated) {
      setError('Login required to create additional conversations.');
      return;
    }

    try {
      const created = await createConversation();
      setConversations((prev) => [created, ...prev]);
      setActiveConversationId(created.id);
      setMessages([]);
      setAssistantDraft('');
      setDocxSession(null);
      setGuestMessageUsed(false);
      setError(null);
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || !activeConversationId || isSending) return;
    if (!isAuthenticated && guestMessageUsed) {
      setError('Guest mode allows one AI reply only. Please login to continue.');
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: trimmed,
      id: `local-${Date.now()}`,
    };
    const outboundMessages = [...messages, userMessage].map((item) => ({
      role: item.role,
      content: item.content,
    }));

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAssistantDraft('');
    setError(null);
    setIsSending(true);
    setStreamPhase('thinking');

    let assistantContent = '';
    let hasTokenEvent = false;

    try {
      const response = await fetch(toApiUrl('/ai/chat/stream'), {
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

          let event: StreamingEvent;
          try {
            event = JSON.parse(line) as StreamingEvent;
          } catch {
            throw new Error('Malformed streaming response payload');
          }

          if (event.type === 'meta' && event.conversation_id) {
            setActiveConversationId(event.conversation_id);
            continue;
          }

          if (event.type === 'error') {
            throw new Error(event.error || 'Streaming failed');
          }

          if (event.type === 'token') {
            const delta = event.content ?? '';
            if (!delta) continue;
            hasTokenEvent = true;
            setStreamPhase('typing');
            assistantContent += delta;
            setAssistantDraft(assistantContent);
            continue;
          }

          if (event.type === 'agent_delta' && !hasTokenEvent) {
            const delta = event.content ?? '';
            if (!delta) continue;
            setStreamPhase('typing');
            assistantContent += delta;
            setAssistantDraft(assistantContent);
          }
        }
      }

      if (assistantContent.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantContent, id: `assistant-${Date.now()}` },
        ]);
      }

      if (!isAuthenticated) {
        setGuestMessageUsed(true);
      }

      setAssistantDraft('');
      await loadConversations();
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setStreamPhase('idle');
      setIsSending(false);
    }
  };

  const handleGenerateDocx = async () => {
    if (!messages.length || !activeConversationId || isGeneratingDocx || !selectedTemplateId) return;
    setIsGeneratingDocx(true);
    setError(null);
    setJsonStreamDraft('');

    try {
      let currentJsonDraft: Record<string, unknown> = {};
      if (templateJsonDraft.trim()) {
        try {
          currentJsonDraft = JSON.parse(templateJsonDraft) as Record<string, unknown>;
        } catch {
          throw new Error('Template JSON is invalid. Fix the JSON syntax and try again.');
        }
      }

      const streamResponse = await fetch(toApiUrl('/ai/docx/json/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: selectedTemplateId,
          conversation_id: activeConversationId,
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          current_json_data: currentJsonDraft,
        }),
      });
      if (!streamResponse.ok || !streamResponse.body) {
        throw new Error('Unable to stream DOCX JSON generation');
      }

      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let resultJson: Record<string, unknown> | null = null;
      let resultTemplateXml = templateXml;
      let resultFilename = 'draft.docx';
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
          const event = JSON.parse(line) as StreamingEvent;

          if (event.type === 'error') {
            throw new Error(event.error || 'DOCX JSON stream failed');
          }
          if (event.type === 'json_token') {
            const delta = event.content ?? '';
            if (!delta) continue;
            setJsonStreamDraft((prev) => prev + delta);
            continue;
          }
          if (event.type === 'json_result') {
            resultJson = (event.json_data ?? {}) as Record<string, unknown>;
            resultTemplateXml = (event.template_xml as string) || resultTemplateXml;
            resultFilename = (event.filename as string) || resultFilename;
            setTemplateJsonDraft(JSON.stringify(resultJson, null, 2));
            setTemplateXml(resultTemplateXml);
          }
        }
      }

      if (!resultJson) {
        throw new Error('DOCX JSON generation returned no usable data');
      }

      const sessionResponse = await fetch(toApiUrl('/export/docx/session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_xml: resultTemplateXml,
          json_data: resultJson,
          filename: resultFilename,
        }),
      });
      if (!sessionResponse.ok) throw new Error('Unable to initialize DOCX viewer');
      const sessionPayload = (await sessionResponse.json()) as DocxSession;
      setDocxSession(sessionPayload);
      setDocxRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setIsGeneratingDocx(false);
    }
  };

  const handleCopyAssistantText = async () => {
    if (!isAuthenticated) {
      setError('Login is required before copying generated output.');
      return;
    }
    if (!latestAssistantMessage) return;
    await navigator.clipboard.writeText(latestAssistantMessage);
  };

  const handleDownloadDocx = () => {
    if (!isAuthenticated) {
      setError('Login is required before downloading documents.');
      return;
    }
    if (!docxSession) return;
    if (!UUID_PATTERN.test(docxSession.docx_id)) {
      setError('Unable to download document. Please generate it again.');
      return;
    }
    window.open(
      toApiUrl(`/export/docx/files/${docxSession.docx_id}`),
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handleApplyTemplateJson = async () => {
    if (!isAuthenticated) {
      setError('Login is required before editing documents.');
      return;
    }
    if (!templateXml || !templateJsonDraft.trim()) return;

    try {
      let parsedJson: Record<string, unknown>;
      try {
        parsedJson = JSON.parse(templateJsonDraft) as Record<string, unknown>;
      } catch {
        throw new Error('Template JSON is invalid. Fix the JSON syntax before applying.');
      }
      const response = await fetch(toApiUrl('/export/docx/session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_xml: templateXml,
          json_data: parsedJson,
          filename: typeof parsedJson.title === 'string' ? `${parsedJson.title}.docx` : 'draft.docx',
        }),
      });
      if (!response.ok) throw new Error('Unable to apply template data');
      const sessionPayload = (await response.json()) as DocxSession;
      setDocxSession(sessionPayload);
      setDocxRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(normalizeError(err));
    }
  };

  return (
    <RealtimePageFrame>
      {!isAuthenticated && (
        <div
          className='mb-4 rounded-xl border px-4 py-3 text-sm'
          style={{
            borderColor: `${colors.accentColor.color}66`,
            backgroundColor: `${colors.accentColor.color}16`,
          }}
        >
          Guest mode: one free AI reply is enabled. Continue chatting, editing, copying,
          and downloading after{' '}
          <Link href='/login' className='font-semibold underline'>
            login
          </Link>
          .
        </div>
      )}

      <section className='grid min-h-[calc(100vh-12rem)] gap-3 xl:grid-cols-[260px_minmax(0,1fr)_380px]'>
        <aside
          className='rounded-2xl border p-4 shadow-lg backdrop-blur-sm'
          style={{
            borderColor: `${colors.secondaryColor.color}55`,
            backgroundColor: `${colors.secondaryColor.color}16`,
          }}
        >
          <button
            type='button'
            className='mb-3 w-full rounded-xl border px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60'
            style={{
              backgroundColor: colors.primaryColor.color as string,
              color: colors.backgroundColor.color as string,
              borderColor: `${colors.primaryColor.color}CC`,
            }}
            onClick={handleNewConversation}
            disabled={!isAuthenticated}
          >
            + New chat
          </button>

          {!isAuthenticated && (
            <p className='mb-3 text-xs opacity-75'>Login to access multi-chat history.</p>
          )}

          <div className='max-h-[calc(100vh-20rem)] space-y-2 overflow-y-auto'>
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type='button'
                className='w-full rounded-xl border px-3 py-2 text-left text-sm transition-all disabled:cursor-not-allowed'
                style={{
                  borderColor:
                    activeConversationId === conversation.id
                      ? (colors.accentColor.color as string)
                      : `${colors.secondaryColor.color}55`,
                  backgroundColor:
                    activeConversationId === conversation.id
                      ? `${colors.accentColor.color}24`
                      : `${colors.backgroundColor.color}55`,
                }}
                onClick={() => setActiveConversationId(conversation.id)}
                disabled={!isAuthenticated && conversation.id !== activeConversationId}
              >
                <p className='truncate font-medium'>{conversation.title}</p>
                <p className='text-xs opacity-75'>{conversation.message_count} messages</p>
              </button>
            ))}
          </div>
        </aside>

        <div
          className='flex min-h-0 flex-col rounded-2xl border shadow-xl'
          style={{
            borderColor: `${colors.secondaryColor.color}55`,
            backgroundColor: `${colors.backgroundColor.color}EA`,
          }}
        >
          <header
            className='flex items-center justify-between border-b px-5 py-3'
            style={{ borderColor: `${colors.secondaryColor.color}55` }}
          >
            <div>
              <h1 className='text-lg font-semibold'>
                {activeConversation?.title ?? 'Workspace'}
              </h1>
              {isSending && (
                <p className='mt-1 text-xs opacity-80'>
                  {streamPhase === 'thinking'
                    ? 'Assistant is thinking…'
                    : 'Assistant is typing in real time…'}
                </p>
              )}
            </div>
            <button
              type='button'
              className='rounded-xl border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60'
              style={{ borderColor: `${colors.secondaryColor.color}70` }}
              onClick={() => void handleGenerateDocx()}
              disabled={isGeneratingDocx || messages.length === 0}
            >
              {isGeneratingDocx ? 'Streaming JSON…' : 'Generate DOCX'}
            </button>
          </header>

          <div className='flex-1 space-y-5 overflow-y-auto px-6 py-6'>
            {messages.map((message) => (
              <article
                key={message.id ?? `${message.role}-${message.content.slice(0, 16)}`}
                className='max-w-[86%] rounded-2xl border px-4 py-3 text-sm leading-7 shadow-sm'
                style={{
                  marginLeft: message.role === 'user' ? 'auto' : 0,
                  borderColor:
                    message.role === 'user'
                      ? `${colors.primaryColor.color}88`
                      : `${colors.secondaryColor.color}50`,
                  backgroundColor:
                    message.role === 'user'
                      ? `${colors.primaryColor.color}20`
                      : `${colors.secondaryColor.color}12`,
                }}
              >
                {message.content}
              </article>
            ))}

            {assistantDraft && (
              <article
                className='max-w-[86%] rounded-2xl border px-4 py-3 text-sm leading-7 shadow-md'
                style={{
                  borderColor: `${colors.accentColor.color}80`,
                  backgroundColor: `${colors.accentColor.color}1C`,
                }}
              >
                {assistantDraft}
                <span className='stream-cursor' aria-hidden='true' />
              </article>
            )}

            {isSending && !assistantDraft && (
              <article
                className='max-w-[86%] rounded-2xl border px-4 py-3 text-sm shadow-sm'
                style={{
                  borderColor: `${colors.accentColor.color}80`,
                  backgroundColor: `${colors.accentColor.color}10`,
                }}
              >
                <span className='inline-flex items-center gap-2'>
                  <span className='h-2 w-2 animate-pulse rounded-full bg-current opacity-60' />
                  {streamPhase === 'thinking' ? 'Thinking…' : 'Typing…'}
                </span>
              </article>
            )}
          </div>

          {error && <p className='px-4 pb-2 text-sm text-red-500'>{error}</p>}

          <div className='border-t p-4' style={{ borderColor: `${colors.secondaryColor.color}55` }}>
            <div
              className='flex gap-2 rounded-2xl border p-2 shadow-inner'
              style={{ borderColor: `${colors.secondaryColor.color}50`, backgroundColor: `${colors.backgroundColor.color}F5` }}
            >
              <input
                className='w-full bg-transparent px-3 py-2 text-sm outline-none'
                placeholder='Message SimpleScholar…'
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
                disabled={isSending || (!isAuthenticated && guestMessageUsed)}
                className='rounded-xl border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'
                style={{
                  backgroundColor: colors.primaryColor.color as string,
                  color: colors.backgroundColor.color as string,
                  borderColor: colors.primaryColor.color as string,
                }}
              >
                {isSending ? 'Streaming…' : 'Send'}
              </button>
            </div>
          </div>
        </div>

        <aside
          className='flex min-h-0 flex-col rounded-2xl border shadow-lg'
          style={{
            borderColor: `${colors.secondaryColor.color}55`,
            backgroundColor: `${colors.backgroundColor.color}C2`,
          }}
        >
          <header
            className='flex items-center justify-between gap-2 border-b px-4 py-3'
            style={{ borderColor: `${colors.secondaryColor.color}55` }}
          >
            <h2 className='text-sm font-semibold'>DOCX Preview</h2>
            <div className='flex items-center gap-2'>
              <button
                type='button'
                className='rounded-lg border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60'
                style={{ borderColor: `${colors.secondaryColor.color}70` }}
                onClick={() => void handleCopyAssistantText()}
                disabled={!isAuthenticated || !latestAssistantMessage}
              >
                Copy
              </button>
              <button
                type='button'
                className='rounded-lg border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60'
                style={{ borderColor: `${colors.secondaryColor.color}70` }}
                onClick={handleDownloadDocx}
                disabled={!isAuthenticated || !docxSession}
              >
                Download
              </button>
            </div>
          </header>

          <div className='flex-1 overflow-hidden'>
            {docxSession ? (
              <iframe
                title={`SimpleScholar DOCX preview: ${docxSession.filename}`}
                aria-label={`SimpleScholar DOCX preview for ${docxSession.filename}`}
                src={`${docxSession.viewer_path}?v=${docxRefreshKey}`}
                className='h-full min-h-[380px] w-full border-0'
              />
            ) : (
              <div className='flex h-full min-h-[380px] items-center justify-center px-6 text-center text-sm opacity-75'>
                Generate a DOCX draft from the conversation to preview it here.
              </div>
            )}
          </div>

          <div className='border-t p-3' style={{ borderColor: `${colors.secondaryColor.color}55` }}>
            <p className='mb-2 text-xs font-semibold opacity-85'>Template service controls</p>
            <select
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
              className='mb-2 w-full rounded-lg border bg-transparent px-2 py-1.5 text-xs outline-none'
              style={{ borderColor: `${colors.secondaryColor.color}70` }}
            >
              {docxTemplates.map((template) => (
                <option key={template.id} value={template.id} className='text-black'>
                  {template.name}
                </option>
              ))}
            </select>

            <textarea
              value={templateJsonDraft}
              onChange={(event) => setTemplateJsonDraft(event.target.value)}
              className='mb-2 h-28 w-full resize-none rounded-lg border bg-transparent px-2 py-1 text-xs outline-none'
              style={{ borderColor: `${colors.secondaryColor.color}70` }}
              placeholder='Template JSON data'
              disabled={!isAuthenticated}
            />

            {jsonStreamDraft && (
              <div
                className='mb-2 max-h-24 overflow-y-auto rounded-lg border px-2 py-1 text-[11px]'
                style={{ borderColor: `${colors.secondaryColor.color}70` }}
              >
                <p className='mb-1 font-semibold opacity-80'>Live JSON stream</p>
                <pre className='whitespace-pre-wrap break-words'>{jsonStreamDraft}</pre>
              </div>
            )}

            <button
              type='button'
              className='w-full rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60'
              style={{
                borderColor: colors.primaryColor.color as string,
                backgroundColor: `${colors.primaryColor.color}20`,
              }}
              onClick={() => void handleApplyTemplateJson()}
              disabled={!isAuthenticated || !templateXml || !templateJsonDraft.trim()}
            >
              Apply template JSON to DOCX
            </button>
          </div>
        </aside>
      </section>
    </RealtimePageFrame>
  );
}
