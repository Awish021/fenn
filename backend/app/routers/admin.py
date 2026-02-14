from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.database import get_db
from app.dependencies import require_admin
from app.models import User
from app.schemas import ResetPasswordRequest, UserCreate, UserOut
from app.utils.serializers import user_to_out

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> UserOut:
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        is_admin=payload.is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_to_out(user)


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> list[UserOut]:
    users = db.query(User).order_by(User.id.asc()).all()
    return [user_to_out(user) for user in users]


@router.post(
    "/users/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def reset_password(
    user_id: int,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> Response:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
