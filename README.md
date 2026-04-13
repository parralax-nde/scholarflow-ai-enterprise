# ScholarFlow AI Enterprise

Enterprise-ready project scaffold that implements the required modules from the issue specification:

- **Backend (FastAPI)**: core health/registry, OAuth callback + JWT/RBAC scopes, plagiarism similarity + remediation, citation validation, collaboration WebSocket broadcast, export endpoint, billing webhook, admin health summary.
- **Frontend (React + TypeScript)**: design-tokenized responsive layout, animated sidebar, workspace split panes, skeleton shimmer loader, mobile bottom navigation, and impact metrics chart.

## Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Tests

```bash
cd backend
pytest -q
```
