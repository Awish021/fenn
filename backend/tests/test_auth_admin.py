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


def test_bootstrap_admin_login_and_refresh(client):
    tokens = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    assert tokens["access_token"]
    assert tokens["refresh_token"]

    refresh_response = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refresh_response.status_code == 200
    refreshed = refresh_response.json()
    assert refreshed["access_token"] != ""
    assert refreshed["refresh_token"] != ""


def test_admin_routes_are_guarded(client):
    admin_tokens = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_access = admin_tokens["access_token"]

    create_user_response = client.post(
        "/admin/users",
        json={"username": "regular", "password": "regular-pass", "is_admin": False},
        headers=auth_header(admin_access),
    )
    assert create_user_response.status_code == 201

    regular_tokens = login(client, "regular", "regular-pass")
    regular_access = regular_tokens["access_token"]

    forbidden_response = client.get("/admin/users", headers=auth_header(regular_access))
    assert forbidden_response.status_code == 403


def test_admin_can_reset_password(client):
    admin_tokens = login(client, ADMIN_USERNAME, ADMIN_PASSWORD)
    admin_access = admin_tokens["access_token"]

    created = client.post(
        "/admin/users",
        json={"username": "target", "password": "old-pass", "is_admin": False},
        headers=auth_header(admin_access),
    )
    assert created.status_code == 201
    user_id = created.json()["id"]

    reset_response = client.post(
        f"/admin/users/{user_id}/reset-password",
        json={"new_password": "new-pass"},
        headers=auth_header(admin_access),
    )
    assert reset_response.status_code == 204

    old_login = client.post("/auth/login", json={"username": "target", "password": "old-pass"})
    assert old_login.status_code == 401

    new_login = client.post("/auth/login", json={"username": "target", "password": "new-pass"})
    assert new_login.status_code == 200
