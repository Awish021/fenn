from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Category, Group, GroupMember, Item, User
from app.schemas import CategoryCreate, CategoryOut, CategoryUpdate, ItemCreate, ItemOut, ItemUpdate
from app.utils.text import sanitize_item_text

router = APIRouter(tags=["categories"])


def _is_group_member(db: Session, group_id: int, user_id: int) -> bool:
    membership = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
        .first()
    )
    return membership is not None


def _assert_group_access(db: Session, group_id: int, user: User) -> Group:
    group = db.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if not user.is_admin and not _is_group_member(db, group_id, user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return group


def _member_users_for_group(db: Session, group_id: int) -> list[User]:
    members = (
        db.query(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .filter(GroupMember.group_id == group_id)
        .order_by(GroupMember.id.asc())
        .all()
    )
    return members


def _category_with_group(db: Session, category_id: int) -> Category:
    category = db.query(Category).options(joinedload(Category.group)).filter(Category.id == category_id).first()
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


def _item_to_out(item: Item) -> ItemOut:
    member_ids = sorted(member.id for member in item.members)
    return ItemOut(
        id=item.id,
        category_id=item.category_id,
        owner_user_id=item.owner_user_id,
        text=item.text,
        member_ids=member_ids,
    )


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    group_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CategoryOut]:
    _assert_group_access(db, group_id, current_user)
    categories = db.query(Category).filter(Category.group_id == group_id).order_by(Category.id.asc()).all()
    return [CategoryOut(id=category.id, group_id=category.group_id, name=category.name) for category in categories]


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryOut:
    _assert_group_access(db, payload.group_id, current_user)
    category = Category(group_id=payload.group_id, name=payload.name)
    db.add(category)
    db.commit()
    db.refresh(category)
    return CategoryOut(id=category.id, group_id=category.group_id, name=category.name)


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryOut:
    category = _category_with_group(db, category_id)
    _assert_group_access(db, category.group_id, current_user)
    category.name = payload.name
    db.commit()
    db.refresh(category)
    return CategoryOut(id=category.id, group_id=category.group_id, name=category.name)


@router.delete(
    "/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    category = _category_with_group(db, category_id)
    _assert_group_access(db, category.group_id, current_user)
    db.delete(category)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/categories/{category_id}/items", response_model=list[ItemOut])
def list_items(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ItemOut]:
    category = _category_with_group(db, category_id)
    _assert_group_access(db, category.group_id, current_user)
    items = (
        db.query(Item)
        .options(joinedload(Item.members))
        .filter(Item.category_id == category_id)
        .order_by(Item.id.asc())
        .all()
    )
    return [_item_to_out(item) for item in items]


@router.post("/categories/{category_id}/items", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
def create_item(
    category_id: int,
    payload: ItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ItemOut:
    category = _category_with_group(db, category_id)
    _assert_group_access(db, category.group_id, current_user)

    valid_members = _member_users_for_group(db, category.group_id)
    valid_member_ids = {member.id for member in valid_members}
    requested_member_ids = set(payload.member_ids)
    if not requested_member_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="member_ids cannot be empty")
    if not requested_member_ids.issubset(valid_member_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid member_ids")

    text = sanitize_item_text(payload.text)
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item text is empty after sanitization")

    item = Item(category_id=category_id, owner_user_id=current_user.id, text=text)
    item.members = [member for member in valid_members if member.id in requested_member_ids]
    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_to_out(item)


@router.put("/items/{item_id}", response_model=ItemOut)
def update_item(
    item_id: int,
    payload: ItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ItemOut:
    item = db.query(Item).options(joinedload(Item.category), joinedload(Item.members)).filter(Item.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    _assert_group_access(db, item.category.group_id, current_user)

    if item.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own items")

    valid_members = _member_users_for_group(db, item.category.group_id)
    valid_member_ids = {member.id for member in valid_members}
    requested_member_ids = set(payload.member_ids)
    if not requested_member_ids or not requested_member_ids.issubset(valid_member_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid member_ids")

    text = sanitize_item_text(payload.text)
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item text is empty after sanitization")

    item.text = text
    item.members = [member for member in valid_members if member.id in requested_member_ids]
    db.commit()
    db.refresh(item)
    return _item_to_out(item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    item = db.query(Item).options(joinedload(Item.category)).filter(Item.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    _assert_group_access(db, item.category.group_id, current_user)

    if item.owner_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own items")

    db.delete(item)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/categories/{category_id}/venn")
def category_venn(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    category = (
        db.query(Category)
        .options(joinedload(Category.items).joinedload(Item.members), joinedload(Category.group))
        .filter(Category.id == category_id)
        .first()
    )
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    _assert_group_access(db, category.group_id, current_user)

    group_members = _member_users_for_group(db, category.group_id)
    group_members = group_members[:4]
    member_index = {member.id: index for index, member in enumerate(group_members)}

    sections: dict[int, dict] = {}
    for mask in range(1, 16):
        section_members = []
        for idx, member in enumerate(group_members):
            if mask & (1 << idx):
                section_members.append({"id": member.id, "username": member.username})
        sections[mask] = {"members": section_members, "items": []}

    for item in category.items:
        mask = 0
        for member in item.members:
            bit_index = member_index.get(member.id)
            if bit_index is not None:
                mask |= 1 << bit_index
        if mask == 0:
            continue
        sections[mask]["items"].append(
            {
                "id": item.id,
                "text": item.text,
                "owner_user_id": item.owner_user_id,
                "member_ids": sorted(member.id for member in item.members),
            }
        )

    return {str(mask): sections[mask] for mask in range(1, 16)}
