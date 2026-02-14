from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class UserOut(BaseModel):
    id: int
    username: str
    is_admin: bool


class ResetPasswordRequest(BaseModel):
    new_password: str


class GroupCreate(BaseModel):
    name: str
    member_limit: int = Field(ge=2, le=4)


class GroupOut(BaseModel):
    id: int
    name: str
    member_limit: int


class AddGroupMemberRequest(BaseModel):
    user_id: int


class GroupMemberOut(BaseModel):
    user_id: int
    username: str


class CategoryCreate(BaseModel):
    group_id: int
    name: str


class CategoryUpdate(BaseModel):
    name: str


class CategoryOut(BaseModel):
    id: int
    group_id: int
    name: str


class ItemCreate(BaseModel):
    text: str
    member_ids: list[int]


class ItemUpdate(BaseModel):
    text: str
    member_ids: list[int]


class ItemOut(BaseModel):
    id: int
    category_id: int
    owner_user_id: int
    text: str
    member_ids: list[int]
