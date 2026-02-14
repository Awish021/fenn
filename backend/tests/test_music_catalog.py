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

    categories = client.get(f"/categories?group_id={group_id}", headers=auth_header(user1_token))
    assert categories.status_code == 200
    category_list = categories.json()
    assert any(category.get("builtin_key") == "music" for category in category_list)
    music_category = next(category for category in category_list if category.get("builtin_key") == "music")
    category_id = music_category["id"]

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

    venn = client.get(f"/categories/{category_id}/venn", headers=auth_header(user1_token))
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
