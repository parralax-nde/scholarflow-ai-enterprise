# ScholarFlow AI Enterprise

This repository now includes a **Docker Compose-first** implementation with all 10 specified modules wired into a runnable enterprise stack.

## Quick start (Docker Compose)

```bash
cd /home/runner/work/scholarflow-ai-enterprise/scholarflow-ai-enterprise
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
   - JWT (1 hour), refresh token rotation, RBAC scopes by tier

3. **Frontend Service**
   - Design tokens, responsive 12-column layout, breakpoints
   - Framer Motion sidebar/drawer and mobile bottom nav
   - Research workspace split pane + shimmer skeleton loader

4. **Plagiarism Engine**
   - Sentence-level cosine threshold detection (`> 0.8`)
   - Remediation output + event stream (`/plagiarism/remediate`, `/plagiarism/events`)

5. **Citation Manager**
   - Claim support categorization (`Supported`, `Partially Supported`, `Unsupported`)

6. **Collaboration Service**
   - WebSocket broadcast (`/collab/ws/{doc_id}`)
   - CRDT-style merge state clock/cursor tracking (`/collab/state/{doc_id}`)

7. **Export & Rendering**
   - Jinja2-based template rendering for PDF media responses (`/export/pdf`)

8. **Billing Service**
   - Stripe webhook contract (`invoice.paid`, `subscription.deleted`)

9. **Data Visualization**
   - Chart.js dashboard metrics for citation impact + plagiarism risk

10. **Admin Dashboard**
    - Service health aggregate endpoint (`/admin/service-health`) with status icons in frontend UI

## Local dev without Docker

### Backend

```bash
cd /home/runner/work/scholarflow-ai-enterprise/scholarflow-ai-enterprise/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd /home/runner/work/scholarflow-ai-enterprise/scholarflow-ai-enterprise/frontend
npm install
npm run dev
```

## Tests

```bash
cd /home/runner/work/scholarflow-ai-enterprise/scholarflow-ai-enterprise/backend
pytest -q
```
