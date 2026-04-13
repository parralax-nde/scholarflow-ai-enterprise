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
