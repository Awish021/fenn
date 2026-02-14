from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = BASE_DIR / "venndiagram.db"


def get_database_url() -> str:
    return os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Environment variable {name!r} is required")
    return value


def _parse_origins(raw_value: str) -> list[str]:
    return [origin.strip() for origin in raw_value.split(",") if origin.strip()]


JWT_SECRET_KEY = _require_env("JWT_SECRET_KEY")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "30"))
REFRESH_TOKEN_DAYS = int(os.getenv("REFRESH_TOKEN_DAYS", "7"))
BOOTSTRAP_ADMIN_USERNAME = _require_env("BOOTSTRAP_ADMIN_USERNAME")
BOOTSTRAP_ADMIN_PASSWORD = _require_env("BOOTSTRAP_ADMIN_PASSWORD")
ALLOWED_ORIGINS = _parse_origins(os.getenv("FRONTEND_ORIGIN", "http://localhost:3000"))
