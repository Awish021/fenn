# Fenn Backend (Phase 1)

## Environment variables

The backend requires the following variables before it starts: there are no insecure defaults for secrets.

- `JWT_SECRET_KEY` — symmetric secret used to sign JWTs.
- `BOOTSTRAP_ADMIN_USERNAME` — username for the admin user created automatically at bootstrap.
- `BOOTSTRAP_ADMIN_PASSWORD` — password for the bootstrap admin account.
- `FRONTEND_ORIGIN` (optional, defaults to `http://localhost:3000`) — origin that is allowed by CORS.
- `DATABASE_URL` (optional, defaults to `sqlite:///./venndiagram.db`) — SQLAlchemy connection string.
- `CATALOG_SEED_FILE` (optional) — JSON/JSONL file used for catalog seeding when explicitly configured (for example in `backend-migrate`).
- `CATALOG_SEED_BATCH_SIZE` (optional, defaults to `5000`) — batch size used by the bulk seed script (`alembic/seed_catalog.py`) when loading large catalogs.
- `SKIP_CATALOG_SEED` (optional) — set to `1`, `true`, `yes`, or `on` to skip the automatic catalog seed (handy for isolated tests or custom migrations).

Copy `backend/.env.example` to `.env`, update the values, and load it before running the backend. When running via Docker Compose, place the same variables in a `.env` file next to `docker-compose.yml` (you can copy and edit `backend/.env.example` for convenience).

## Run locally

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install --upgrade pip uv
uv pip install -r requirements.txt
alembic -c alembic.ini upgrade head
python alembic/bootstrap.py
uv run uvicorn app.main:app --reload
```

`uv pip install -r requirements.txt` builds the packages inside the venv as part of that dependency step.

Default SQLite DB file: `backend/venndiagram.db`.

The bootstrap admin user is created once by `python alembic/bootstrap.py` using the provided environment credentials.

## Run via Docker Compose

```bash
cd ..
docker compose up --build
```

Compose starts a one-shot `backend-migrate` service first, which runs `alembic upgrade head`, `python alembic/bootstrap.py`, and `python alembic/seed_catalog.py`. After that completes successfully, the `backend` service starts and exposes `/health` for the healthcheck.

During backend image build, Docker downloads real-world catalog sources (IMDb titles/ratings + Wikidata hobbies) and materializes `/opt/catalog/catalog_seed.realworld.jsonl` inside the image. The `backend-migrate` service then bulk-loads that file with `python alembic/seed_catalog.py`, so the SQLite catalog is already rich before the API boots.

By default Compose sets `SKIP_CATALOG_SEED=1` for the API service to avoid reseeding on every startup; built-in categories are still ensured on startup.

The backend receives required secret vars from the `.env` placed alongside `docker-compose.yml`, and persists the SQLite file in the `backend-data` named volume so data survives container restarts.

To rerun migrations/bootstrap manually:

```bash
docker compose run --rm backend-migrate
```

## Run tests

```bash
cd backend
pytest -q
```

## Catalog seed

On every startup the backend ensures the forced built-in categories (music, movies, TV shows, hobbies) exist for every group. Catalog items are seeded only when `CATALOG_SEED_FILE` is explicitly set. Each seed entry should specify `category_key`, `provider`, `provider_id`, `title`, and `logo_url`; optional `subtitle`, `attribution`, and `provider_url` enrich the display.

For large local datasets, use `python alembic/seed_catalog.py --file <json-or-jsonl>`; it performs SQLite upserts in batches and supports an optional `popularity_score` field to improve ranking.

IMDb data is used in non-commercial mode and should remain for personal/dev usage unless you review IMDb's current licensing terms.
