from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.auth import hash_password
from app.config import BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_USERNAME
from app.models import Base, User


logger = logging.getLogger(__name__)


def init_db(engine) -> None:
    Base.metadata.create_all(bind=engine)


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
