from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_database_url

engine = None
SessionLocal: sessionmaker[Session] | None = None


def configure_database(database_url: str | None = None) -> None:
    global engine
    global SessionLocal

    url = database_url or get_database_url()
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, future=True, connect_args=connect_args)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_db():
    if SessionLocal is None:
        configure_database()
    if SessionLocal is None:
        raise RuntimeError("Database is not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


configure_database()
