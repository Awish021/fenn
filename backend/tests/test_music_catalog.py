from __future__ import annotations

import os

from datetime import datetime

from app import database
from app.models import CatalogItem

ADMIN_USERNAME = os.environ.get("BOOTSTRAP_ADMIN_USERNAME", "test-admin")
ADMIN_PASSWORD = os.environ.get("BOOTSTRAP_ADMIN_PASSWORD", "test-password")


def login(client, username: str, password: str) -> dict:
    response = client.post("/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_user_as_admin(client, admin_token: str, username: str, password: str) -> int:
    response = client.post(
        "/admin/users",
        json={"username": username, "password": password, "is_admin": False},
        headers=auth_header(admin_token),
    )
    assert response.status_code == 201
    return response.json()["id"]


def insert_catalog_item(
    category_key: str,
    provider: str,
    provider_id: str,
    title: str,
    subtitle: str | None,
    logo_url: str,
    popularity_score: int = 0,
) -> CatalogItem:
    if database.SessionLocal is None:
        raise RuntimeError("SessionLocal is missing")
    db = database.SessionLocal()
    try:
        item = CatalogItem(
            category_key=category_key,
            provider=provider,
            provider_id=provider_id,
            title=title,
            subtitle=subtitle,
            logo_url=logo_url,
            popularity_score=popularity_score,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    finally:
        db.close()


def test_music_catalog_listing_and_likes(client):
    admin = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_token = admin["access_token"]

    user1_id = create_user_as_admin(client, admin_token, "user-band-a", "pass-a")
    user2_id = create_user_as_admin(client, admin_token, "user-band-b", "pass-b")

    user1_token = login(client, "user-band-a", "pass-a")["access_token"]
    user2_token = login(client, "user-band-b", "pass-b")["access_token"]

    group = client.post(
        "/groups",
        json={"name": "Music Catalog", "member_limit": 4},
        headers=auth_header(user1_token),
    )
    assert group.status_code == 201
    group_id = group.json()["id"]

    add_user2 = client.post(
        f"/groups/{group_id}/members",
        json={"user_id": user2_id},
        headers=auth_header(admin_token),
    )
    assert add_user2.status_code == 201

    categories = client.get("/categories", headers=auth_header(user1_token))
    assert categories.status_code == 200
    category_list = categories.json()
    assert any(category.get("builtin_key") == "music" for category in category_list)

    catalog_shared = insert_catalog_item(
        "music",
        "test",
        "shared",
        "Shared Orbit",
        "Synth / maelstrom",
        "https://cdn.example.com/band-a.png",
    )
    catalog_user1 = insert_catalog_item(
        "music",
        "test",
        "solo",
        "Solo Light",
        "Bedroom post-rock",
        "https://cdn.example.com/band-b.png",
    )

    like_shared_user1 = client.post(
        f"/catalog/music/items/test/{catalog_shared.provider_id}/likes",
        headers=auth_header(user1_token),
    )
    assert like_shared_user1.status_code == 201

    like_shared_user2 = client.post(
        f"/catalog/music/items/test/{catalog_shared.provider_id}/likes",
        headers=auth_header(user2_token),
    )
    assert like_shared_user2.status_code == 201

    like_user1 = client.post(
        f"/catalog/music/items/test/{catalog_user1.provider_id}/likes",
        headers=auth_header(user1_token),
    )
    assert like_user1.status_code == 201

    band_list = client.get("/catalog/music/items?q=Orbit", headers=auth_header(user1_token))
    assert band_list.status_code == 200
    orbit_entry = next(item for item in band_list.json() if item["provider_id"] == catalog_shared.provider_id)
    assert orbit_entry["liked_by_user"] is True
    assert orbit_entry["like_count"] == 2

    venn = client.get(f"/groups/{group_id}/venn/music", headers=auth_header(user1_token))
    assert venn.status_code == 200
    venn_body = venn.json()

    mask_one_items = venn_body["1"]["items"]
    assert mask_one_items
    assert any(item["text"] == catalog_user1.title and item["logo_url"] == catalog_user1.logo_url for item in mask_one_items)

    mask_three_items = venn_body["3"]["items"]
    assert mask_three_items
    assert any(item["text"] == catalog_shared.title and item["subtitle"] == catalog_shared.subtitle for item in mask_three_items)
    shared_entry = next(item for item in mask_three_items if item["provider_id"] == catalog_shared.provider_id)
    assert shared_entry["provider"] == catalog_shared.provider
    assert shared_entry["category_key"] == "music"

    unlike_user1 = client.delete(
        f"/catalog/music/items/test/{catalog_user1.provider_id}/likes",
        headers=auth_header(user1_token),
    )
    assert unlike_user1.status_code == 200

    band_list_after = client.get("/catalog/music/items?q=Solo", headers=auth_header(user1_token))
    assert band_list_after.status_code == 200
    solo_entry = next(item for item in band_list_after.json() if item["provider_id"] == catalog_user1.provider_id)
    assert solo_entry["liked_by_user"] is False


def test_group_venn_requires_group_membership(client):
    admin = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_token = admin["access_token"]

    create_user_as_admin(client, admin_token, "owner-user", "owner-pass")
    create_user_as_admin(client, admin_token, "outsider-user", "outsider-pass")

    owner_token = login(client, "owner-user", "owner-pass")["access_token"]
    outsider_token = login(client, "outsider-user", "outsider-pass")["access_token"]

    group = client.post(
        "/groups",
        json={"name": "Private Group", "member_limit": 4},
        headers=auth_header(owner_token),
    )
    assert group.status_code == 201
    group_id = group.json()["id"]

    forbidden = client.get(f"/groups/{group_id}/venn/music", headers=auth_header(outsider_token))
    assert forbidden.status_code == 403


def test_group_venn_rejects_unknown_category_key(client):
    admin = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_token = admin["access_token"]

    create_user_as_admin(client, admin_token, "lens-user", "lens-pass")
    user_token = login(client, "lens-user", "lens-pass")["access_token"]

    group = client.post(
        "/groups",
        json={"name": "Known Keys", "member_limit": 4},
        headers=auth_header(user_token),
    )
    assert group.status_code == 201
    group_id = group.json()["id"]

    missing = client.get(f"/groups/{group_id}/venn/not_a_builtin", headers=auth_header(user_token))
    assert missing.status_code == 404


def test_categories_listing_ignores_group_id(client):
    admin = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_token = admin["access_token"]

    no_filter = client.get("/categories", headers=auth_header(admin_token))
    assert no_filter.status_code == 200

    with_filter = client.get("/categories?group_id=123456", headers=auth_header(admin_token))
    assert with_filter.status_code == 200

    no_filter_keys = [category["builtin_key"] for category in no_filter.json()]
    with_filter_keys = [category["builtin_key"] for category in with_filter.json()]
    assert no_filter_keys == with_filter_keys


def test_catalog_search_prioritizes_popularity(client):
    admin = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_token = admin["access_token"]

    popular = insert_catalog_item(
        "music",
        "test",
        "popular-item",
        "Tune Storm",
        "Most liked option",
        "https://cdn.example.com/popular.png",
        popularity_score=2500,
    )
    lesser = insert_catalog_item(
        "music",
        "test",
        "lesser-item",
        "Tune River",
        "Less discovered option",
        "https://cdn.example.com/lesser.png",
        popularity_score=25,
    )

    response = client.get("/catalog/music/items?q=Tune", headers=auth_header(admin_token))
    assert response.status_code == 200
    payload = response.json()

    filtered = [row for row in payload if row["provider_id"] in {popular.provider_id, lesser.provider_id}]
    assert len(filtered) == 2
    assert filtered[0]["provider_id"] == popular.provider_id
    assert filtered[0]["popularity_score"] == popular.popularity_score


def test_catalog_listing_supports_pagination(client):
    admin = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_token = admin["access_token"]

    for index in range(3):
        insert_catalog_item(
            "music",
            "test",
            f"paging-item-{index}",
            f"Paging Result {index + 1}",
            "Pagination test entry",
            "https://cdn.example.com/paging.png",
            popularity_score=100 - index,
        )

    page_one = client.get("/catalog/music/items?q=Paging%20Result&page=1&limit=2", headers=auth_header(admin_token))
    assert page_one.status_code == 200
    page_one_ids = [item["provider_id"] for item in page_one.json() if item["provider_id"].startswith("paging-item-")]
    assert page_one_ids == ["paging-item-0", "paging-item-1"]

    page_two = client.get("/catalog/music/items?q=Paging%20Result&page=2&limit=2", headers=auth_header(admin_token))
    assert page_two.status_code == 200
    page_two_ids = [item["provider_id"] for item in page_two.json() if item["provider_id"].startswith("paging-item-")]
    assert page_two_ids == ["paging-item-2"]
