from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.builtins import ensure_group_builtin_categories
from app.models import Group, GroupMember, User
from app.schemas import AddGroupMemberRequest, GroupCreate, GroupMemberOut, GroupOut
from app.utils.avatar import build_avatar_data_url

router = APIRouter(tags=["groups"])


def _is_group_member(db: Session, group_id: int, user_id: int) -> bool:
    membership = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
        .first()
    )
    return membership is not None


@router.get("/groups", response_model=list[GroupOut])
def list_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GroupOut]:
    if current_user.is_admin:
        groups = db.query(Group).order_by(Group.id.asc()).all()
    else:
        groups = (
            db.query(Group)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .filter(GroupMember.user_id == current_user.id)
            .order_by(Group.id.asc())
            .all()
        )
    return [GroupOut(id=group.id, name=group.name, member_limit=group.member_limit) for group in groups]


@router.post("/groups", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(
    payload: GroupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> GroupOut:
    group = Group(name=payload.name, member_limit=payload.member_limit, created_by_id=current_user.id)
    db.add(group)
    db.flush()

    ensure_group_builtin_categories(db, group.id)

    db.add(GroupMember(group_id=group.id, user_id=current_user.id))
    db.commit()
    db.refresh(group)
    return GroupOut(id=group.id, name=group.name, member_limit=group.member_limit)


@router.delete(
    "/groups/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> Response:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    db.delete(group)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/groups/{group_id}/members", response_model=list[GroupMemberOut])
def list_group_members(
    group_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[GroupMemberOut]:
    group = (
        db.query(Group)
        .options(joinedload(Group.members).joinedload(GroupMember.user))
        .filter(Group.id == group_id)
        .first()
    )
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    if not current_user.is_admin and not _is_group_member(db, group.id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    members = sorted(group.members, key=lambda gm: gm.id)
    return [
        GroupMemberOut(
            user_id=member.user_id,
            username=member.user.username,
            avatar_data_url=build_avatar_data_url(member.user.avatar_blob, member.user.avatar_content_type),
        )
        for member in members
    ]


@router.post("/groups/{group_id}/members", status_code=status.HTTP_201_CREATED)
def add_group_member(
    group_id: int,
    payload: AddGroupMemberRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
) -> dict:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

    user = db.get(User, payload.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.user_id == payload.user_id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already in group")

    member_count = db.query(GroupMember).filter(GroupMember.group_id == group_id).count()
    if member_count >= group.member_limit:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group member limit reached")

    db.add(GroupMember(group_id=group_id, user_id=payload.user_id))
    db.commit()
    return {"status": "ok"}
