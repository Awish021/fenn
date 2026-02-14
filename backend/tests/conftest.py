from __future__ import annotations

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET_KEY", "tests-secret-key")
os.environ.setdefault("BOOTSTRAP_ADMIN_USERNAME", "test-admin")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "test-password")

from app import database
from app.auth import hash_password
from app.config import BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_USERNAME
from app.models import User


def _run_migrations(database_url: str) -> None:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(config, "head")


def _bootstrap_admin_user() -> None:
    if database.SessionLocal is None:
        raise RuntimeError("SessionLocal is missing")

    db = database.SessionLocal()
    try:
        existing = db.query(User).filter(User.username == BOOTSTRAP_ADMIN_USERNAME).first()
        if existing is not None:
            return

        user = User(
            username=BOOTSTRAP_ADMIN_USERNAME,
            password_hash=hash_password(BOOTSTRAP_ADMIN_PASSWORD),
            is_admin=True,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()


@pytest.fixture
def client(tmp_path: Path):
    db_path = tmp_path / "test.db"
    database_url = f"sqlite:///{db_path}"
    database.configure_database(database_url)

    if database.engine is None:
        raise RuntimeError("Database engine is missing")

    _run_migrations(database_url)

    if database.SessionLocal is None:
        raise RuntimeError("SessionLocal is missing")

    _bootstrap_admin_user()

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def create_user():
    def _create_user(username: str, password: str, is_admin: bool = False) -> int:
        if database.SessionLocal is None:
            raise RuntimeError("SessionLocal is missing")
        db = database.SessionLocal()
        try:
            user = User(username=username, password_hash=hash_password(password), is_admin=is_admin)
            db.add(user)
            db.commit()
            db.refresh(user)
            return user.id
        finally:
            db.close()

    return _create_user


def login(client: TestClient, username: str, password: str) -> dict:
    response = client.post("/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
