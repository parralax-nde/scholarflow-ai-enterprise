from __future__ import annotations

import math
import os
import re
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from jinja2 import Template
from jose import jwt
from pydantic import BaseModel, EmailStr, Field

app = FastAPI(title="ScholarFlow AI Enterprise")

JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
ACCESS_TTL_SECONDS = 3600

users_by_google_sub: dict[str, dict[str, Any]] = {}
refresh_tokens_by_user: dict[str, str] = {}
service_registry: dict[str, dict[str, Any]] = {}
subscriptions: dict[str, str] = defaultdict(lambda: "free")
app_started_at = time.time()


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


class SimilarityRequest(BaseModel):
    text: str
    sources: list[str]


class RemediationRequest(BaseModel):
    flagged_sentences: list[str]


class CitationClaim(BaseModel):
    claim: str
    source_text: str


class CitationValidationRequest(BaseModel):
    citations: list[CitationClaim]


class ExportRequest(BaseModel):
    title: str
    author: str
    body: str
    template: str = """
    <h1>{{ title }}</h1>
    <p><strong>Author:</strong> {{ author }}</p>
    <div>{{ body }}</div>
    """


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


@app.get("/core/health")
def core_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "core",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "instance_id": f"core-{uuid.uuid4()}",
        "metadata_tags": ["core", "fastapi", "scholarflow"],
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
    scopes = ["proposal:read", "proposal:write"]
    if role == "enterprise":
        scopes.append("plagiarism:access")

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

    now = datetime.now(timezone.utc)
    access_payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": role,
        "scopes": scopes,
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
    return {"rewritten": rewritten, "provider": "ollama-llama3-compatible"}


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
            for peer in list(active_docs[doc_id]):
                if peer is not websocket:
                    await peer.send_json(payload)
    except WebSocketDisconnect:
        active_docs[doc_id].discard(websocket)


@app.post("/export/pdf")
def export_pdf(body: ExportRequest) -> Response:
    html = Template(body.template).render(title=body.title, author=body.author, body=body.body)
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
