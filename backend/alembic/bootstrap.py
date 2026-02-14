from __future__ import annotations

import logging
import sys
from pathlib import Path

from sqlalchemy.orm import Session

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app import database
from app.auth import hash_password
from app.config import BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_USERNAME
from app.models import User

logger = logging.getLogger(__name__)


def bootstrap_admin_user(db: Session) -> User:
    existing = db.query(User).filter(User.username == BOOTSTRAP_ADMIN_USERNAME).first()
    if existing:
        return existing

    logger.info("Creating bootstrap admin user %s", BOOTSTRAP_ADMIN_USERNAME)
    user = User(
        username=BOOTSTRAP_ADMIN_USERNAME,
        password_hash=hash_password(BOOTSTRAP_ADMIN_PASSWORD),
        is_admin=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def main() -> None:
    session_local = database.SessionLocal
    if session_local is None:
        raise RuntimeError("Database session is not configured")

    db = session_local()
    try:
        bootstrap_admin_user(db)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
