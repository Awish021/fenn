from __future__ import annotations

import os


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


def test_group_member_limit_enforced(client):
    admin = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_token = admin["access_token"]

    user1_id = create_user_as_admin(client, admin_token, "user1", "pass1")
    user2_id = create_user_as_admin(client, admin_token, "user2", "pass2")
    user3_id = create_user_as_admin(client, admin_token, "user3", "pass3")

    user1_token = login(client, "user1", "pass1")["access_token"]

    group = client.post(
        "/groups",
        json={"name": "Limited Group", "member_limit": 2},
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

    add_user3 = client.post(
        f"/groups/{group_id}/members",
        json={"user_id": user3_id},
        headers=auth_header(admin_token),
    )
    assert add_user3.status_code == 400
    assert add_user3.json()["detail"] == "Group member limit reached"
    assert user1_id > 0


def test_admin_can_delete_group(client):
    admin = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_token = admin["access_token"]

    group = client.post(
        "/groups",
        json={"name": "Delete Group", "member_limit": 4},
        headers=auth_header(admin_token),
    )
    assert group.status_code == 201
    group_id = group.json()["id"]

    delete_response = client.delete(
        f"/groups/{group_id}",
        headers=auth_header(admin_token),
    )
    assert delete_response.status_code == 204

    remaining = client.get("/groups", headers=auth_header(admin_token))
    assert remaining.status_code == 200
    remaining_groups = remaining.json()
    assert all(group["id"] != group_id for group in remaining_groups)


def test_item_ownership_sanitization_and_venn(client):
    admin = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_token = admin["access_token"]

    user1_id = create_user_as_admin(client, admin_token, "owner", "pass-owner")
    user2_id = create_user_as_admin(client, admin_token, "editor", "pass-editor")
    user3_id = create_user_as_admin(client, admin_token, "third", "pass-third")
    user4_id = create_user_as_admin(client, admin_token, "fourth", "pass-fourth")

    owner_token = login(client, "owner", "pass-owner")["access_token"]
    editor_token = login(client, "editor", "pass-editor")["access_token"]
    third_token = login(client, "third", "pass-third")["access_token"]

    group = client.post(
        "/groups",
        json={"name": "Venn Group", "member_limit": 4},
        headers=auth_header(owner_token),
    )
    assert group.status_code == 201
    group_id = group.json()["id"]

    for user_id in [user2_id, user3_id, user4_id]:
        add_response = client.post(
            f"/groups/{group_id}/members",
            json={"user_id": user_id},
            headers=auth_header(admin_token),
        )
        assert add_response.status_code == 201

    category = client.post(
        "/categories",
        json={"group_id": group_id, "name": "Features"},
        headers=auth_header(owner_token),
    )
    assert category.status_code == 201
    category_id = category.json()["id"]

    item_a = client.post(
        f"/categories/{category_id}/items",
        json={"text": "  foo@@@    BAR!!! ", "member_ids": [user1_id, user2_id]},
        headers=auth_header(owner_token),
    )
    assert item_a.status_code == 201
    item_a_body = item_a.json()
    assert item_a_body["text"] == "Foo Bar"

    item_b = client.post(
        f"/categories/{category_id}/items",
        json={"text": "second item", "member_ids": [user2_id, user3_id]},
        headers=auth_header(editor_token),
    )
    assert item_b.status_code == 201
    item_b_body = item_b.json()

    item_c = client.post(
        f"/categories/{category_id}/items",
        json={"text": "all members", "member_ids": [user1_id, user2_id, user3_id, user4_id]},
        headers=auth_header(third_token),
    )
    assert item_c.status_code == 201

    forbidden_update = client.put(
        f"/items/{item_a_body['id']}",
        json={"text": "hijack", "member_ids": [user1_id]},
        headers=auth_header(editor_token),
    )
    assert forbidden_update.status_code == 403

    forbidden_delete = client.delete(
        f"/items/{item_a_body['id']}",
        headers=auth_header(editor_token),
    )
    assert forbidden_delete.status_code == 403

    admin_delete = client.delete(
        f"/items/{item_b_body['id']}",
        headers=auth_header(admin_token),
    )
    assert admin_delete.status_code == 204

    venn = client.get(f"/categories/{category_id}/venn", headers=auth_header(owner_token))
    assert venn.status_code == 200
    venn_body = venn.json()

    assert set(venn_body.keys()) == {str(i) for i in range(1, 16)}
    assert len(venn_body["3"]["items"]) == 1
    assert venn_body["3"]["items"][0]["id"] == item_a_body["id"]
    assert len(venn_body["6"]["items"]) == 0
    assert len(venn_body["15"]["items"]) == 1
