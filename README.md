# ScholarFlow AI Enterprise

This repository now includes a **Docker Compose-first** implementation with all 10 specified modules wired into a runnable enterprise stack.

## Quick start (Docker Compose)

```bash
cd scholarflow-ai-enterprise
docker compose up --build
```

Primary endpoints:

- NGINX edge: `http://localhost`
- Kong proxy: `http://localhost:8000`
- Kong admin: `http://localhost:8001`
- Backend API: `http://localhost:8000/api`
- Frontend app: `http://localhost:5173`
- Consul UI: `http://localhost:8500`
- Vault dev: `http://localhost:8200`
- RabbitMQ UI: `http://localhost:15672`
- Elasticsearch: `http://localhost:9200`
- Ollama: `http://localhost:11434`

## Implemented modules

1. **Core Service**
   - Service health contract (`/core/health`)
   - Service registration (`/core/register`) and startup registry entry (`/core/services`)
   - Kong routing + rate limiting + trace header propagation
   - Vault and Consul included in compose stack

2. **Auth Service**
   - Google OAuth callback contract (`/auth/oauth/google/callback`)
   - Email/password register and login contracts (`/auth/register`, `/auth/login`)
   - JWT (1 hour), refresh token rotation, RBAC scopes by tier

3. **Frontend Service**
   - Advanced chat-style research copilot UI (sharp-corner, non-rounded design)
   - Multi-turn generation flow with streaming response rendering
   - Ollama model indicator and generation status surface

4. **Plagiarism Engine**
   - Sentence-level cosine threshold detection (`> 0.8`)
   - Remediation output + event stream (`/plagiarism/remediate`, `/plagiarism/events`) with configured model metadata

5. **AI Generation Service**
   - Streaming chat endpoint (`/ai/chat/stream`) backed by Ollama
   - Default model configured as `gemma4:e2b` via `OLLAMA_MODEL`
   - `gemma4:e4b` can be used if your Docker workspace has sufficient free disk

6. **Citation Manager**
   - Claim support categorization (`Supported`, `Partially Supported`, `Unsupported`)

7. **Collaboration Service**
   - WebSocket broadcast (`/collab/ws/{doc_id}`)
   - CRDT-style merge state clock/cursor tracking (`/collab/state/{doc_id}`)

8. **Export & Rendering**
   - Jinja2-based template rendering for PDF media responses (`/export/pdf`)

9. **Billing Service**
   - Stripe webhook contract (`invoice.paid`, `subscription.deleted`)

10. **Admin Dashboard**
     - Service health aggregate endpoint (`/admin/service-health`) with status icons in frontend UI

## Local dev without Docker

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Optional AI settings for local backend:

```bash
export OLLAMA_BASE_URL=http://localhost:11434
export OLLAMA_MODEL=gemma4:e2b
export OLLAMA_KEEP_ALIVE=-1
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Optional SuperDoc integration (embed in DOCX pane):

```bash
cd frontend
npm install @superdoc-dev/react
```

Notes:
- SuperDoc is mounted directly in the right column using the React wrapper.
- The DOCX third pane is fully automatic: hidden before generation, shown while generating/editing, and no manual show/hide button is required.

## Tests

```bash
cd backend
pytest -q
```
