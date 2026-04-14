import json

from fastapi.testclient import TestClient
from jose import jwt

import app.main as main_module
from app.main import ACCESS_TTL_SECONDS, CrdtOperation, JWT_ALGORITHM, JWT_SECRET, _merge_crdt_operation, app

client = TestClient(app)


def test_core_health_contract():
    response = client.get("/core/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "core"
    assert "instance_id" in body
    assert response.headers["x-trace-id"]


def test_core_register_adds_service_to_registry():
    reg = client.post("/core/register", json={"service_name": "worker", "metadata_tags": ["celery", "queue"]})
    assert reg.status_code == 200
    service = reg.json()
    services = client.get("/core/services").json()
    assert any(item["instance_id"] == service["instance_id"] for item in services)


def test_google_oauth_callback_issues_1h_jwt_and_refresh_token():
    response = client.post(
        "/auth/oauth/google/callback",
        json={
            "code": "oauth-code",
            "tier": "enterprise",
            "profile": {"sub": "google-user-1", "email": "user@example.com", "name": "Test User"},
        },
    )
    assert response.status_code == 200
    payload = response.json()
    decoded = jwt.decode(payload["access_token"], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert decoded["role"] == "enterprise"
    assert "plagiarism:access" in decoded["scopes"]
    assert decoded["exp"] - decoded["iat"] == ACCESS_TTL_SECONDS
    assert payload["refresh_token"]


def test_email_password_register_and_login_issue_tokens():
    register = client.post(
        "/auth/register",
        json={
            "email": "password-user@example.com",
            "name": "Password User",
            "password": "StrongPass123!",
            "tier": "free",
        },
    )
    assert register.status_code == 200
    register_payload = register.json()
    assert register_payload["user"]["email"] == "password-user@example.com"
    assert register_payload["user"]["auth_provider"] == "password"
    decoded_register = jwt.decode(register_payload["access_token"], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert decoded_register["role"] == "free"
    assert decoded_register["exp"] - decoded_register["iat"] == ACCESS_TTL_SECONDS

    login = client.post(
        "/auth/login",
        json={"email": "password-user@example.com", "password": "StrongPass123!"},
    )
    assert login.status_code == 200
    login_payload = login.json()
    decoded_login = jwt.decode(login_payload["access_token"], JWT_SECRET, algorithms=[JWT_ALGORITHM])
    assert decoded_login["email"] == "password-user@example.com"
    assert login_payload["refresh_token"]


def test_email_password_login_rejects_invalid_credentials():
    register = client.post(
        "/auth/register",
        json={
            "email": "invalid-login@example.com",
            "name": "Invalid Login",
            "password": "StrongPass123!",
            "tier": "free",
        },
    )
    assert register.status_code == 200

    bad_login = client.post(
        "/auth/login",
        json={"email": "invalid-login@example.com", "password": "WrongPass123!"},
    )
    assert bad_login.status_code == 401
    assert bad_login.json()["detail"] == "invalid credentials"


def test_plagiarism_similarity_flags_high_similarity_sentences():
    response = client.post(
        "/plagiarism/similarity",
        json={
            "text": "Machine learning enables predictive analytics. This sentence is different.",
            "sources": ["Machine learning enables predictive analytics."],
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["threshold"] == 0.8
    assert len(body["flagged"]) == 1


def test_plagiarism_remediation_publishes_event():
    response = client.post("/plagiarism/remediate", json={"flagged_sentences": ["Original sentence."]})
    assert response.status_code == 200
    body = response.json()
    assert body["event_type"] == "plagiarism.remediated"
    assert body["provider"] == "ollama"
    assert body["model"] == "gemma4:e2b"
    events = client.get("/plagiarism/events").json()["events"]
    assert any(event["event_id"] == body["event_id"] for event in events)


def test_ai_chat_stream_returns_ndjson_tokens(monkeypatch):
    async def mock_generate_chat(context_messages):
        assert context_messages
        return [
            {"agent": "Analyst", "content": "Answer A"},
            {"agent": "Researcher", "content": "Answer B"},
        ]

    monkeypatch.setattr(main_module, "_generate_chat_with_crewai", mock_generate_chat)

    response = client.post(
        "/ai/chat/stream",
        json={"messages": [{"role": "user", "content": "Write intro paragraph"}]},
    )
    assert response.status_code == 200
    lines = [json.loads(line) for line in response.text.strip().splitlines()]
    assert lines[0]["type"] == "meta"
    assert lines[0]["model"] == "gemma4:e2b"
    assert lines[0]["phase"] == "requesting"
    assert lines[0]["orchestrator"] == "chatdev-like"
    assert lines[1]["type"] == "meta"
    assert lines[1]["phase"] == "streaming"
    assert lines[1]["agents"] == 3
    agent_lines = [line for line in lines if line.get("type") == "agent_result"]
    assert len(agent_lines) == 2
    assert any(line["agent"] == "Analyst" and "Answer A" in line["content"] for line in agent_lines)
    assert any(line["agent"] == "Researcher" and "Answer B" in line["content"] for line in agent_lines)
    assert lines[-1] == {"type": "done"}


def test_ai_mcp_docx_generate_returns_docx_plan(monkeypatch):
    async def mock_generate_docx(seed_text, source_messages, current_template_xml=None, current_json_data=None):
        assert seed_text
        assert source_messages
        return (
            "<doc><h1>{{title}}</h1><p>{{body}}</p></doc>",
            {
                "title": "Draft Plan",
                "author": {"name": "Copilot"},
                "abstract": "Summary",
                "body": "Details",
            },
            "draft-plan.docx",
        )

    monkeypatch.setattr(main_module, "_generate_docx_draft_with_crewai", mock_generate_docx)

    response = client.post(
        "/ai/mcp/tools/docx/generate",
        json={
            "current_template_xml": "<doc><h1>{{title}}</h1><p>{{body}}</p></doc>",
            "current_json_data": {"title": "Existing", "body": "Draft"},
            "messages": [
                {"role": "user", "content": "Draft a market analysis report"},
                {"role": "assistant", "content": "I can help with that."},
            ]
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "crewai-mcp-docx-tool"
    assert body["template_xml"].startswith("<doc>")
    assert body["json_data"]["title"] == "Draft Plan"
    assert body["filename"] == "draft-plan.docx"


def test_ai_conversations_and_messages_are_persisted(monkeypatch):
    async def mock_generate_chat(context_messages):
        assert context_messages
        return [{"agent": "Strategist", "content": "Stored reply"}]

    monkeypatch.setattr(main_module, "_generate_chat_with_crewai", mock_generate_chat)

    conversation = client.post("/ai/conversations", json={})
    assert conversation.status_code == 200
    conversation_id = conversation.json()["id"]

    response = client.post(
        "/ai/chat/stream",
        json={
            "conversation_id": conversation_id,
            "messages": [{"role": "user", "content": "Persist this conversation"}],
        },
    )
    assert response.status_code == 200

    listed = client.get("/ai/conversations")
    assert listed.status_code == 200
    assert any(item["id"] == conversation_id for item in listed.json())

    messages = client.get(f"/ai/conversations/{conversation_id}/messages")
    assert messages.status_code == 200
    body = messages.json()
    assert body["conversation_id"] == conversation_id
    assert any(item["role"] == "user" and "Persist this conversation" in item["content"] for item in body["messages"])
    assert any(item["role"] == "assistant" and "Stored reply" in item["content"] for item in body["messages"])
    assert any(item["role"] == "assistant" and "[Agent:Strategist]" in item["content"] for item in body["messages"])


def test_crdt_merge_updates_state_clock_text_and_cursor():
    result = _merge_crdt_operation(
        "doc-1",
        CrdtOperation(op_id="op-1", actor_id="user-1", timestamp=1, text_patch="Hello", cursor_position=5),
    )
    assert result["clock"] >= 2
    assert result["text"] == "Hello"
    assert result["cursor"]["user-1"] == 5


def test_extract_superdoc_session_id_handles_multiple_payload_shapes():
    assert main_module._extract_superdoc_session_id({"session_id": "abc-1"}) == "abc-1"
    assert main_module._extract_superdoc_session_id({"result": {"sessionId": "abc-2"}}) == "abc-2"
    assert main_module._extract_superdoc_session_id('{"session_id":"abc-3"}') == "abc-3"


def test_export_docx_preview_renders_xml_with_json_fields():
    response = client.post(
        "/export/docx/preview",
        json={
            "template_xml": "<doc><h1>{{title}}</h1><p>{{author.name}}</p></doc>",
            "json_data": {"title": "Research Draft", "author": {"name": "Ada"}},
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert "Research Draft" in body["resolved_xml"]
    assert "Ada" in body["resolved_xml"]
    assert any("Research Draft" in paragraph for paragraph in body["paragraphs"])


def test_export_docx_returns_docx_binary():
    response = client.post(
        "/export/docx",
        json={
            "template_xml": "<doc><h1>{{title}}</h1><p>{{body}}</p></doc>",
            "json_data": {"title": "T", "body": "B"},
            "filename": "sample.docx",
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert response.headers["content-disposition"].endswith('filename="sample.docx"')
    assert response.content[:2] == b"PK"


def test_export_docx_session_and_file_fetch():
    session = client.post(
        "/export/docx/session",
        json={
            "template_xml": "<doc><h1>{{title}}</h1><p>{{body}}</p></doc>",
            "json_data": {"title": "Session", "body": "Artifact"},
            "filename": "session.docx",
        },
    )
    assert session.status_code == 200
    payload = session.json()
    assert payload["viewer_path"].startswith("/docx-viewer/render/")

    fetch = client.get(f"/export/docx/files/{payload['docx_id']}")
    assert fetch.status_code == 200
    assert fetch.headers["content-type"] == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    assert fetch.content[:2] == b"PK"
