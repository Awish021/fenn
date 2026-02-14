from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.config import ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_SIZE_BYTES
from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.schemas import UserOut
from app.utils.serializers import user_to_out

router = APIRouter(tags=["users"])


@router.get("/users/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return user_to_out(current_user)


@router.post("/users/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    content_type = file.content_type
    if content_type not in ALLOWED_AVATAR_MIME_TYPES:  # type: ignore[comparison-overlap]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {content_type}",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Avatar file is empty")
    if len(data) > MAX_AVATAR_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Avatar must be less than {MAX_AVATAR_SIZE_BYTES // 1024} KB",
        )
    current_user.avatar_blob = data
    current_user.avatar_content_type = content_type
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return user_to_out(current_user)


@router.delete("/users/me/avatar", response_model=UserOut)
def delete_avatar(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    current_user.avatar_blob = None
    current_user.avatar_content_type = None
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return user_to_out(current_user)
