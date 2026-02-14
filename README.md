# Fenn

Fenn is a lightweight overlap-mapping app with three coordinated surfaces:

- `backend` runs the FastAPI/Zod-style service that stores groups, categories, items, and venn sections.
- `frontend` hosts the React/Vite UI that talks to `/api` through the proxy and renders the lockup/venn interfaces.
- `e2e` keeps Playwright suites that drive the running stack to validate the happy flows from login through venn interactions.

## Getting started

### Backend
1. `cd backend`
2. Copy `backend/.env.example` to `.env` and supply real secrets (see the backend README for the list).
3. `python3 -m venv .venv && source .venv/bin/activate`
4. `pip install -r requirements.txt`
5. `alembic -c alembic.ini upgrade head`
6. `python alembic/bootstrap.py`
7. `uvicorn app.main:app --reload`

The backend README covers Docker Compose, database persistence, and additional test commands such as `pytest -q`.

### Frontend
1. `cd frontend`
2. `npm install`
3. `npm run dev`

Vite listens on `http://localhost:3000` and proxies `/api` to the backend, so run both services together (Docker Compose already wires them).

### End-to-end tests
1. `docker compose up --build`
2. In another shell `cd e2e && npm install`
3. `npm run test:install` (first time only) and `npm test`

The e2e suites can be pointed at other hosts via `PLAYWRIGHT_BASE_URL` and `PLAYWRIGHT_BACKEND_URL`; credentials default to `test-admin` / `test-password` unless you override `PLAYWRIGHT_ADMIN_USERNAME` / `PLAYWRIGHT_ADMIN_PASSWORD`.

## Security

- `.env` files and any secret values stay local and are ignored by Git (`.gitignore` already blocks `.env`, `.env.*`, caches, and build artifacts).
- Never commit production secrets or mix them into checked-in files; use `.env.example` or CI variables to capture necessary keys.
