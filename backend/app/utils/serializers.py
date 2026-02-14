from __future__ import annotations

from app.models import User
from app.schemas import UserOut
from app.utils.avatar import build_avatar_data_url


def user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        is_admin=user.is_admin,
        avatar_data_url=build_avatar_data_url(user.avatar_blob, user.avatar_content_type),
    )
