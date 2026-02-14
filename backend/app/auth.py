from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import HTTPException, status

from app.config import ACCESS_TOKEN_MINUTES, JWT_ALGORITHM, JWT_SECRET_KEY, REFRESH_TOKEN_DAYS


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def _create_token(payload: dict, expires_delta: timedelta) -> str:
    now = datetime.now(tz=timezone.utc)
    to_encode = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: int, username: str, is_admin: bool) -> str:
    return _create_token(
        {
            "sub": str(user_id),
            "username": username,
            "is_admin": is_admin,
            "type": "access",
        },
        timedelta(minutes=ACCESS_TOKEN_MINUTES),
    )


def create_refresh_token(user_id: int) -> str:
    return _create_token(
        {
            "sub": str(user_id),
            "type": "refresh",
        },
        timedelta(days=REFRESH_TOKEN_DAYS),
    )


def decode_token(token: str, expected_type: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    if payload.get("type") != expected_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    return payload
