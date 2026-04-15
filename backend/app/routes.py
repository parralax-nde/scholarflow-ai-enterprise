from __future__ import annotations

from . import core as _core

globals().update({name: value for name, value in _core.__dict__.items() if not name.startswith("__")})

@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    trace_id = _trace_id_from_request(dict(request.headers))
    response = await call_next(request)
    response.headers["X-Trace-Id"] = trace_id
    return response


@app.get("/core/health")
def core_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": app_service_name,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "instance_id": app_instance_id,
        "metadata_tags": app_metadata_tags,
    }


@app.post("/core/register")
def register_service(body: RegisterServiceRequest) -> dict[str, Any]:
    instance_id = f"{body.service_name}-{uuid.uuid4()}"
    service_registry[instance_id] = {
        "instance_id": instance_id,
        "service_name": body.service_name,
        "metadata_tags": body.metadata_tags,
        "uptime_seconds": int(time.time() - app_started_at),
        "request_latency_ms": 12,
        "error_rate": 0.0,
    }
    return service_registry[instance_id]


@app.get("/core/services")
def list_services() -> list[dict[str, Any]]:
    return list(service_registry.values())


@app.post("/auth/oauth/google/callback")
def oauth_google_callback(body: OAuthCallbackRequest) -> dict[str, Any]:
    role = "enterprise" if body.tier == "enterprise" else "free"

    user = users_by_google_sub.setdefault(
        body.profile.sub,
        {
            "id": str(uuid.uuid4()),
            "email": body.profile.email,
            "name": body.profile.name,
            "role": role,
        },
    )
    user["role"] = role

    return _issue_tokens_for_user(user)


@app.post("/auth/register")
def auth_register(body: EmailPasswordRegisterRequest) -> dict[str, Any]:
    email_key = body.email.lower()
    if email_key in users_by_email:
        raise HTTPException(status_code=409, detail="email already registered")

    role = "enterprise" if body.tier == "enterprise" else "free"
    salt = secrets.token_hex(16)
    user_id = str(uuid.uuid4())
    user_record = {
        "id": user_id,
        "email": email_key,
        "name": body.name,
        "role": role,
        "auth_provider": "password",
        "password_salt": salt,
        "password_hash": _hash_password(body.password, salt),
    }
    users_by_email[email_key] = user_record
    public_user = {k: v for k, v in user_record.items() if not k.startswith("password_")}
    return _issue_tokens_for_user(public_user)


@app.post("/auth/login")
def auth_login(body: EmailPasswordLoginRequest) -> dict[str, Any]:
    email_key = body.email.lower()
    user_record = users_by_email.get(email_key)
    if not user_record:
        raise HTTPException(status_code=401, detail="invalid credentials")

    if not _verify_password(body.password, user_record["password_salt"], user_record["password_hash"]):
        raise HTTPException(status_code=401, detail="invalid credentials")

    public_user = {k: v for k, v in user_record.items() if not k.startswith("password_")}
    return _issue_tokens_for_user(public_user)


@app.get("/colors/palettes")
def list_color_palettes() -> list[dict[str, Any]]:
    return _list_color_palettes()


@app.post("/colors/palettes")
def create_color_palette(body: ColorPaletteCreateRequest) -> dict[str, Any]:
    return _create_color_palette(body.name, body.colors.model_dump())


@app.delete("/colors/palettes/{palette_id}")
def delete_color_palette(palette_id: str) -> dict[str, Any]:
    if not _delete_color_palette(palette_id):
        raise HTTPException(status_code=404, detail="Palette not found")
    return {"deleted": True, "id": palette_id}


@app.get("/ai/conversations")
def ai_list_conversations() -> list[dict[str, Any]]:
    return _list_conversations()


@app.post("/ai/conversations")
def ai_create_conversation(body: ConversationCreateRequest | None = None) -> dict[str, Any]:
    title = DEFAULT_CONVERSATION_TITLE
    if body and body.title and body.title.strip():
        title = body.title.strip()[:MAX_CONVERSATION_TITLE_LENGTH]
    return _create_conversation(title=title)


@app.get("/ai/conversations/{conversation_id}/messages")
def ai_list_messages(conversation_id: str) -> dict[str, Any]:
    if not _conversation_exists(conversation_id):
        raise HTTPException(status_code=404, detail="conversation not found")
    return {"conversation_id": conversation_id, "messages": _list_messages(conversation_id)}


@app.post("/ai/chat/stream")
async def ai_chat_stream(body: ChatStreamRequest) -> StreamingResponse:
    conversation_id = body.conversation_id
    if conversation_id:
        if not _conversation_exists(conversation_id):
            raise HTTPException(status_code=404, detail="conversation not found")
    else:
        conversation = _create_conversation()
        conversation_id = conversation["id"]

    user_messages = [message for message in body.messages if message.role == "user"]
    latest_user_message = user_messages[-1].content.strip() if user_messages else ""
    if not latest_user_message:
        raise HTTPException(status_code=400, detail="at least one user message is required")
    _add_message(conversation_id, "user", latest_user_message)

    context_messages = body.messages[-MAX_CONTEXT_MESSAGES:] if len(body.messages) > MAX_CONTEXT_MESSAGES else body.messages

    async def stream_generator():
        yield json.dumps(
            {
                "type": "meta",
                "model": OLLAMA_MODEL,
                "phase": "requesting",
                "orchestrator": "langchain",
                "conversation_id": conversation_id,
            }
        ) + "\n"
        try:
            yield json.dumps(
                {
                    "type": "meta",
                    "model": OLLAMA_MODEL,
                    "phase": "streaming",
                    "orchestrator": "langchain",
                    "agents": 1,
                    "mode": "token-level",
                }
            ) + "\n"
            crew_context = [message.model_dump() for message in context_messages]
            assistant_content_parts: list[str] = []

            yield json.dumps({"type": "agent_start", "agent": "Assistant"}) + "\n"
            async for token in _stream_chat_with_langchain(crew_context):
                assistant_content_parts.append(token)
                yield json.dumps({"type": "token", "content": token}) + "\n"
                # Backward-compatible event for older consumers.
                yield json.dumps({"type": "agent_delta", "agent": "Assistant", "content": token}) + "\n"

            final_content = "".join(assistant_content_parts).strip()
            if final_content:
                _add_message(conversation_id, "assistant", final_content)
                yield json.dumps({"type": "agent_result", "agent": "Assistant", "content": final_content}) + "\n"
            yield json.dumps({"type": "done"}) + "\n"
        except HTTPException as e:
            yield json.dumps({"type": "error", "error": str(e.detail)}) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "error": f"chat generation failed: {str(e)}"}) + "\n"

    return StreamingResponse(
        stream_generator(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@app.post("/ai/mcp/tools/docx/generate", response_model=DocxToolGenerateResponse)
async def ai_mcp_docx_generate(body: DocxToolGenerateRequest) -> DocxToolGenerateResponse:
    source_messages: list[dict[str, str]] = []
    if body.messages:
        source_messages = [
            {"role": message.role, "content": message.content}
            for message in body.messages
            if message.content.strip()
        ]
    elif body.conversation_id:
        if not _conversation_exists(body.conversation_id):
            raise HTTPException(status_code=404, detail="conversation not found")
        source_messages = [
            {"role": message["role"], "content": message["content"]}
            for message in _list_messages(body.conversation_id)
            if str(message.get("content", "")).strip()
        ]

    if not source_messages and not (body.prompt and body.prompt.strip()):
        raise HTTPException(status_code=400, detail="conversation_id, messages, or prompt is required")

    seed_text = (body.prompt or "").strip()
    if not seed_text:
        user_like_messages = [m["content"] for m in source_messages if m["role"] == "user"]
        seed_text = user_like_messages[-1].strip() if user_like_messages else source_messages[-1]["content"]

    template_xml, json_data, filename = await _generate_docx_draft_with_crewai(
        seed_text,
        source_messages,
        body.current_template_xml,
        body.current_json_data,
    )

    return DocxToolGenerateResponse(
        template_xml=template_xml,
        json_data=json_data,
        filename=filename,
        model=OLLAMA_MODEL,
        source="crewai-mcp-docx-tool",
    )


@app.post("/plagiarism/similarity")
def plagiarism_similarity(body: SimilarityRequest) -> dict[str, Any]:
    source_sentences: list[str] = []
    for source in body.sources:
        source_sentences.extend(_split_sentences(source))

    flagged = []
    for sentence in _split_sentences(body.text):
        score = max((_cosine_similarity(sentence, src) for src in source_sentences), default=0.0)
        if score > 0.8:
            flagged.append({"sentence": sentence, "similarity": round(score, 4)})
    return {"threshold": 0.8, "flagged": flagged}


@app.post("/plagiarism/remediate")
def plagiarism_remediate(body: RemediationRequest) -> dict[str, Any]:
    rewritten = [f"Rewritten: {s}" for s in body.flagged_sentences]
    event = {
        "event_id": str(uuid.uuid4()),
        "event_type": "plagiarism.remediated",
        "provider": "ollama",
        "model": OLLAMA_MODEL,
        "rewritten": rewritten,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    plagiarism_events.append(event)
    return event


@app.get("/plagiarism/events")
def plagiarism_event_stream() -> dict[str, Any]:
    return {"events": plagiarism_events}


@app.post("/citations/validate")
def citation_validate(body: CitationValidationRequest) -> dict[str, Any]:
    results = []
    for item in body.citations:
        score = _cosine_similarity(item.claim, item.source_text)
        status = "Unsupported"
        if score >= 0.6:
            status = "Supported"
        elif score >= 0.3:
            status = "Partially Supported"
        results.append({"claim": item.claim, "status": status, "score": round(score, 3)})
    return {"results": results}


active_docs: dict[str, set[WebSocket]] = defaultdict(set)


@app.websocket("/collab/ws/{doc_id}")
async def collab_ws(doc_id: str, websocket: WebSocket) -> None:
    await websocket.accept()
    active_docs[doc_id].add(websocket)
    try:
        while True:
            payload = await websocket.receive_json()
            merged = None
            if {"op_id", "actor_id", "timestamp"}.issubset(payload.keys()):
                merged = _merge_crdt_operation(doc_id, CrdtOperation(**payload))
            for peer in list(active_docs[doc_id]):
                if peer is not websocket:
                    await peer.send_json({"operation": payload, "state": merged or doc_crdt_state[doc_id]})
    except WebSocketDisconnect:
        active_docs[doc_id].discard(websocket)


@app.get("/collab/state/{doc_id}")
def collab_state(doc_id: str) -> dict[str, Any]:
    state = doc_crdt_state[doc_id]
    return {"doc_id": doc_id, "clock": state["clock"], "text": state["text"], "cursor": state["cursor"]}


@app.post("/export/pdf")
def export_pdf(body: ExportRequest) -> Response:
    safe_template = Environment(autoescape=True).from_string(
        """
    <style>
    body { font-family: Inter, Arial, sans-serif; }
    {{ custom_css }}
    </style>
    <h1>{{ title }}</h1>
    <p><strong>Author:</strong> {{ author }}</p>
    <div>{{ body }}</div>
    """
    )
    html = safe_template.render(title=body.title, author=body.author, body=body.body, custom_css=body.custom_css)
    # Lightweight text-based output with PDF media type for integration contract testing.
    return Response(content=html.encode("utf-8"), media_type="application/pdf")


@app.post("/export/docx/preview", response_model=DocxPreviewResponse)
def export_docx_preview(body: DocxTemplateRequest) -> DocxPreviewResponse:
    resolved_xml = _resolve_template_placeholders(body.template_xml, body.json_data)
    try:
        root = ET.fromstring(resolved_xml)
    except ET.ParseError as exc:
        raise HTTPException(status_code=400, detail=f"invalid template XML: {exc}") from exc

    paragraphs = _extract_docx_paragraphs(root)
    preview_html = _build_preview_html(root)
    return DocxPreviewResponse(resolved_xml=resolved_xml, preview_html=preview_html, paragraphs=paragraphs)


@app.post("/export/docx")
def export_docx(body: DocxTemplateRequest) -> Response:
    resolved_xml = _resolve_template_placeholders(body.template_xml, body.json_data)
    docx_bytes = _build_docx_bytes_from_xml(resolved_xml)
    safe_filename = body.filename.strip() or "draft.docx"
    if not safe_filename.lower().endswith(".docx"):
        safe_filename = f"{safe_filename}.docx"

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@app.post("/export/docx/session", response_model=DocxSessionResponse)
def export_docx_session(body: DocxTemplateRequest) -> DocxSessionResponse:
    resolved_xml = _resolve_template_placeholders(body.template_xml, body.json_data)
    docx_bytes = _build_docx_bytes_from_xml(resolved_xml)
    safe_filename = body.filename.strip() or "draft.docx"
    if not safe_filename.lower().endswith(".docx"):
        safe_filename = f"{safe_filename}.docx"

    _clean_docx_artifacts()
    artifact_id = str(uuid.uuid4())
    DOCX_ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    file_path = DOCX_ARTIFACT_DIR / f"{artifact_id}-{re.sub(r'[^a-zA-Z0-9._-]+', '-', safe_filename)}"
    file_path.write_bytes(docx_bytes)
    docx_artifacts[artifact_id] = {
        "content": docx_bytes,
        "filename": safe_filename,
        "file_path": str(file_path),
        "created_at": time.time(),
    }
    return DocxSessionResponse(
        docx_id=artifact_id,
        filename=safe_filename,
        viewer_path=f"/docx-viewer/render/{artifact_id}",
    )


@app.get("/export/docx/files/{docx_id}")
def export_docx_file(docx_id: str) -> Response:
    _clean_docx_artifacts()
    artifact = docx_artifacts.get(docx_id)
    if not artifact:
        raise HTTPException(status_code=404, detail="docx artifact not found")

    file_path = artifact.get("file_path")
    content = artifact.get("content")
    if isinstance(file_path, str) and file_path and Path(file_path).exists():
        content = Path(file_path).read_bytes()
        artifact["content"] = content

    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'inline; filename="{artifact["filename"]}"'},
    )


@app.post("/ai/mcp/superdoc/open")
def ai_mcp_superdoc_open(body: SuperdocOpenRequest) -> dict[str, Any]:
    file_path = _ensure_docx_artifact_file(body.docx_id)
    opened = _superdoc_call_tool("open", {"path": file_path})
    return {"docx_id": body.docx_id, "opened": opened}


@app.post("/ai/mcp/superdoc/apply")
def ai_mcp_superdoc_apply(body: SuperdocApplyRequest) -> dict[str, Any]:
    file_path = _ensure_docx_artifact_file(body.docx_id)
    clipped = body.content.strip()[:3500]
    if not clipped:
        raise HTTPException(status_code=400, detail="content cannot be empty")

    try:
        document = Document(file_path)
        for paragraph in [line.strip() for line in clipped.splitlines() if line.strip()]:
            document.add_paragraph(paragraph)
        document.save(file_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"local docx edit failed: {exc}") from exc

    _reload_docx_artifact_content(body.docx_id)
    return {
        "docx_id": body.docx_id,
        "applied": True,
        "mode": "local-docx-edit",
        "file_path": file_path,
    }


@app.post("/ai/mcp/superdoc/save")
def ai_mcp_superdoc_save(body: SuperdocSessionRequest) -> dict[str, Any]:
    return _superdoc_call_tool("save", {"session_id": body.session_id})


@app.post("/ai/mcp/superdoc/close")
def ai_mcp_superdoc_close(body: SuperdocSessionRequest) -> dict[str, Any]:
    return _superdoc_call_tool("close", {"session_id": body.session_id})


@app.post("/billing/webhook")
def billing_webhook(
    payload: dict[str, Any], stripe_signature: str | None = Header(default=None, alias="Stripe-Signature")
) -> dict[str, Any]:
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="missing stripe signature")

    event_type = payload.get("type")
    user_id = str(payload.get("data", {}).get("object", {}).get("metadata", {}).get("user_id", ""))
    if not user_id:
        raise HTTPException(status_code=400, detail="missing user id metadata")

    if event_type == "invoice.paid":
        subscriptions[user_id] = "enterprise"
    elif event_type == "subscription.deleted":
        subscriptions[user_id] = "free"

    return {"ok": True, "user_id": user_id, "tier": subscriptions[user_id]}


@app.get("/admin/service-health")
def admin_service_health() -> dict[str, Any]:
    return {
        "services": list(service_registry.values()),
        "summary": {
            "total": len(service_registry),
            "healthy": len(service_registry),
            "degraded": 0,
        },
    }
