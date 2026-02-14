from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("JWT_SECRET_KEY", "tests-secret-key")
os.environ.setdefault("BOOTSTRAP_ADMIN_USERNAME", "test-admin")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "test-password")

from app import database
from app.auth import hash_password
from app.bootstrap import bootstrap_admin_user
from app.models import Base, User


@pytest.fixture
def client(tmp_path: Path):
    db_path = tmp_path / "test.db"
    database.configure_database(f"sqlite:///{db_path}")

    if database.engine is None:
        raise RuntimeError("Database engine is missing")

    Base.metadata.drop_all(bind=database.engine)
    Base.metadata.create_all(bind=database.engine)

    if database.SessionLocal is None:
        raise RuntimeError("SessionLocal is missing")

    db = database.SessionLocal()
    try:
        bootstrap_admin_user(db)
    finally:
        db.close()

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
