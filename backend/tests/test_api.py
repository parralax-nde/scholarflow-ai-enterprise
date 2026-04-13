from fastapi.testclient import TestClient
from jose import jwt

from app.main import ACCESS_TTL_SECONDS, JWT_ALGORITHM, JWT_SECRET, app

client = TestClient(app)


def test_core_health_contract():
    response = client.get("/core/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "core"


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
