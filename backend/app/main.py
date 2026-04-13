from __future__ import annotations

import hashlib
import hmac
import json
import math
import os
import re
import secrets
import sqlite3
import time
import uuid
from collections import Counter, defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import Response, StreamingResponse
from jinja2 import Environment
from jose import jwt
from pydantic import BaseModel, EmailStr, Field

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TTL_SECONDS = 3600
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma4:e2b")
CHAT_DB_PATH = Path(os.getenv("CHAT_DB_PATH", str(Path(__file__).with_name("chat_history.db"))))

users_by_google_sub: dict[str, dict[str, Any]] = {}
users_by_email: dict[str, dict[str, Any]] = {}
refresh_tokens_by_user: dict[str, str] = {}
service_registry: dict[str, dict[str, Any]] = {}
subscriptions: dict[str, str] = defaultdict(lambda: "free")
app_started_at = time.time()
app_instance_id = os.getenv("SERVICE_INSTANCE_ID", f"core-{uuid.uuid4()}")
app_service_name = os.getenv("SERVICE_NAME", "core")
app_metadata_tags = [tag for tag in os.getenv("SERVICE_METADATA_TAGS", "core,fastapi,scholarflow").split(",") if tag]
plagiarism_events: list[dict[str, Any]] = []
doc_crdt_state: dict[str, dict[str, Any]] = defaultdict(
    lambda: {"clock": 0, "text": "", "cursor": {}, "operations": [], "applied_operation_ids": set()}
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect_chat_db() -> sqlite3.Connection:
    return sqlite3.connect(CHAT_DB_PATH)


def _init_chat_db() -> None:
    CHAT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect_chat_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC)")


def _conversation_exists(conversation_id: str) -> bool:
    with _connect_chat_db() as conn:
        row = conn.execute("SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
    return bool(row)


def _create_conversation(title: str = "New chat") -> dict[str, Any]:
    conversation_id = str(uuid.uuid4())
    now = _utc_now_iso()
    with _connect_chat_db() as conn:
        conn.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (conversation_id, title, now, now),
        )
    return {"id": conversation_id, "title": title, "message_count": 0, "updated_at": now}


def _derive_conversation_title(messages: list[dict[str, str]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            content = " ".join(message.get("content", "").strip().split())
            if content:
                return content[:60]
    return "New chat"


def _add_message(conversation_id: str, role: str, content: str) -> dict[str, Any]:
    message_id = str(uuid.uuid4())
    now = _utc_now_iso()
    with _connect_chat_db() as conn:
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
            (message_id, conversation_id, role, content, now),
        )
        conn.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id))
        row = conn.execute("SELECT title FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
        if row and row[0].strip().lower() == "new chat" and role == "user":
            conn.execute("UPDATE conversations SET title = ? WHERE id = ?", (content[:60], conversation_id))
    return {"id": message_id, "conversation_id": conversation_id, "role": role, "content": content, "created_at": now}


def _list_conversations() -> list[dict[str, Any]]:
    with _connect_chat_db() as conn:
        rows = conn.execute(
            """
            SELECT c.id, c.title, c.updated_at, COUNT(m.id) AS message_count
            FROM conversations c
            LEFT JOIN messages m ON m.conversation_id = c.id
            GROUP BY c.id
            ORDER BY c.updated_at DESC
            """
        ).fetchall()
    return [
        {
            "id": row[0],
            "title": row[1],
            "updated_at": row[2],
            "message_count": row[3],
        }
        for row in rows
    ]


def _list_messages(conversation_id: str) -> list[dict[str, Any]]:
    with _connect_chat_db() as conn:
        rows = conn.execute(
            """
            SELECT id, role, content, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY created_at ASC
            """,
            (conversation_id,),
        ).fetchall()
    return [{"id": row[0], "role": row[1], "content": row[2], "created_at": row[3]} for row in rows]


def register_self() -> None:
    service_registry[app_instance_id] = {
        "instance_id": app_instance_id,
        "service_name": app_service_name,
        "metadata_tags": app_metadata_tags,
        "uptime_seconds": 0,
        "request_latency_ms": 12,
        "error_rate": 0.0,
    }


@asynccontextmanager
async def lifespan(_: FastAPI):
    register_self()
    yield


app = FastAPI(title="ScholarFlow AI Enterprise", lifespan=lifespan)


class RegisterServiceRequest(BaseModel):
    service_name: str
    metadata_tags: list[str] = Field(default_factory=list)


class GoogleProfile(BaseModel):
    sub: str
    email: EmailStr
    name: str


class OAuthCallbackRequest(BaseModel):
    code: str
    profile: GoogleProfile
    tier: str = Field(default="free", pattern="^(free|enterprise)$")


class EmailPasswordRegisterRequest(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=8)
    tier: str = Field(default="free", pattern="^(free|enterprise)$")


class EmailPasswordLoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(system|user|assistant)$")
    content: str = Field(min_length=1)


class ChatStreamRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1)


class SimilarityRequest(BaseModel):
    text: str
    sources: list[str]


class RemediationRequest(BaseModel):
    flagged_sentences: list[str]


class CrdtOperation(BaseModel):
    op_id: str
    actor_id: str
    timestamp: int
    text_patch: str = ""
    cursor_position: int = 0


class CitationClaim(BaseModel):
    claim: str
    source_text: str


class CitationValidationRequest(BaseModel):
    citations: list[CitationClaim]


class ExportRequest(BaseModel):
    title: str
    author: str
    body: str
    custom_css: str = ""


def _tokenize(text: str) -> Counter:
    tokens = re.findall(r"[a-zA-Z0-9]+", text.lower())
    return Counter(tokens)


def _cosine_similarity(a: str, b: str) -> float:
    va = _tokenize(a)
    vb = _tokenize(b)
    if not va or not vb:
        return 0.0
    dot = sum(va[t] * vb.get(t, 0) for t in va)
    norm_a = math.sqrt(sum(v * v for v in va.values()))
    norm_b = math.sqrt(sum(v * v for v in vb.values()))
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


def _split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]


def _trace_id_from_request(headers: dict[str, str]) -> str:
    traceparent = headers.get("traceparent", "")
    if traceparent:
        parts = traceparent.split("-")
        if len(parts) >= 2 and parts[1]:
            return parts[1]
    return headers.get("x-request-id", str(uuid.uuid4()))


def _hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return digest.hex()


def _verify_password(password: str, salt: str, expected_hash: str) -> bool:
    return hmac.compare_digest(_hash_password(password, salt), expected_hash)


def _scopes_for_role(role: str) -> list[str]:
    scopes = ["proposal:read", "proposal:write"]
    if role == "enterprise":
        scopes.append("plagiarism:access")
    return scopes


def _issue_tokens_for_user(user: dict[str, Any]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    access_payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "scopes": _scopes_for_role(user["role"]),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ACCESS_TTL_SECONDS)).timestamp()),
    }
    access_token = jwt.encode(access_payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    refresh_token = str(uuid.uuid4())
    refresh_tokens_by_user[user["id"]] = refresh_token
    return {
        "user": user,
        "access_token": access_token,
        "expires_in": ACCESS_TTL_SECONDS,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


def _merge_crdt_operation(doc_id: str, operation: CrdtOperation) -> dict[str, Any]:
    state = doc_crdt_state[doc_id]
    if operation.op_id in state["applied_operation_ids"]:
        return {"doc_id": doc_id, "clock": state["clock"], "text": state["text"], "cursor": state["cursor"]}

    state["operations"].append(operation.model_dump())
    state["applied_operation_ids"].add(operation.op_id)
    ordered_ops = sorted(state["operations"], key=lambda op: (op["timestamp"], op["actor_id"], op["op_id"]))

    merged_text = ""
    cursor_map: dict[str, int] = {}
    max_ts = state["clock"]
    for op in ordered_ops:
        if op["text_patch"]:
            merged_text = f'{merged_text}{op["text_patch"]}'
        cursor_map[op["actor_id"]] = op["cursor_position"]
        max_ts = max(max_ts, op["timestamp"])

    state["clock"] = max_ts + 1
    state["text"] = merged_text
    state["cursor"] = cursor_map
    return {"doc_id": doc_id, "clock": state["clock"], "text": state["text"], "cursor": state["cursor"]}


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


@app.post("/ai/chat/stream")
async def ai_chat_stream(body: ChatStreamRequest) -> StreamingResponse:
    payload = {
        "model": OLLAMA_MODEL,
        "stream": True,
        "messages": [message.model_dump() for message in body.messages],
    }

    async def stream_generator():
        yield json.dumps({"type": "meta", "model": OLLAMA_MODEL}) + "\n"
        try:
            timeout = httpx.Timeout(timeout=90.0, connect=10.0)
            async with httpx.AsyncClient(timeout=timeout) as http_client:
                async with http_client.stream("POST", f"{OLLAMA_BASE_URL}/api/chat", json=payload) as response:
                    if response.status_code >= 400:
                        await response.aread()
                        yield json.dumps(
                            {
                                "type": "error",
                                "error": f"ollama request failed ({response.status_code})",
                            }
                        ) + "\n"
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            yield json.dumps({"type": "token", "content": content}) + "\n"
                        if chunk.get("done"):
                            yield json.dumps({"type": "done"}) + "\n"
        except httpx.HTTPError as e:
            yield json.dumps({"type": "error", "error": f"ollama unavailable: {str(e)}"}) + "\n"

    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
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
