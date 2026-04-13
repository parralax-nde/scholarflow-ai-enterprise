from fastapi.testclient import TestClient
from jose import jwt

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
    events = client.get("/plagiarism/events").json()["events"]
    assert any(event["event_id"] == body["event_id"] for event in events)


def test_crdt_merge_updates_state_clock_text_and_cursor():
    result = _merge_crdt_operation(
        "doc-1",
        CrdtOperation(op_id="op-1", actor_id="user-1", timestamp=1, text_patch="Hello", cursor_position=5),
    )
    assert result["clock"] >= 2
    assert result["text"] == "Hello"
    assert result["cursor"]["user-1"] == 5
