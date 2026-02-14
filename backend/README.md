# Fenn Backend (Phase 1)

## Environment variables

The backend requires the following variables before it starts: there are no insecure defaults for secrets.

- `JWT_SECRET_KEY` — symmetric secret used to sign JWTs.
- `BOOTSTRAP_ADMIN_USERNAME` — username for the admin user created automatically at bootstrap.
- `BOOTSTRAP_ADMIN_PASSWORD` — password for the bootstrap admin account.
- `FRONTEND_ORIGIN` (optional, defaults to `http://localhost:3000`) — origin that is allowed by CORS.
- `DATABASE_URL` (optional, defaults to `sqlite:///./venndiagram.db`) — SQLAlchemy connection string.

Copy `backend/.env.example` to `.env`, update the values, and load it before running the backend. When running via Docker Compose, place the same variables in a `.env` file next to `docker-compose.yml` (you can copy and edit `backend/.env.example` for convenience).

## Run locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip uv
uv pip install -r requirements.txt
uv run uvicorn app.main:app --reload
```

`uv pip install -r requirements.txt` builds the packages inside the venv as part of that dependency step.

Default SQLite DB file: `backend/venndiagram.db`.

The bootstrap admin user is created once using the provided environment credentials.

## Run via Docker Compose

```bash
cd ..
docker-compose up --build
```

The backend service now exposes `/health` for the healthcheck, receives the required secret vars from the `.env` placed alongside `docker-compose.yml`, and persists the SQLite file in the `backend-data` named volume so data survives container restarts.

## Run tests

```bash
cd backend
pytest -q
```
