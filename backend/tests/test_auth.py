"""Authentication, profile and account lifecycle tests."""
from __future__ import annotations


def test_register_login_and_me(client):
    register = client.post(
        "/api/auth/register",
        json={"name": "Aarav Sharma", "email": "Aarav@Example.com", "password": "StrongPass1"},
    )
    assert register.status_code == 201
    body = register.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "aarav@example.com"

    duplicate = client.post(
        "/api/auth/register",
        json={"name": "Aarav", "email": "aarav@example.com", "password": "StrongPass1"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "email_taken"

    bad_login = client.post(
        "/api/auth/login",
        json={"email": "aarav@example.com", "password": "WrongPass1"},
    )
    assert bad_login.status_code == 401

    login = client.post(
        "/api/auth/login",
        json={"email": "aarav@example.com", "password": "StrongPass1"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["name"] == "Aarav Sharma"
    assert me.json()["project_count"] == 0


def test_weak_password_rejected(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Test", "email": "weak@example.com", "password": "password"},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "weak_password"


def test_protected_routes_require_token(client):
    response = client.get("/api/projects")
    assert response.status_code == 401
    assert "Authentication required" in response.json()["detail"]


def test_profile_update_and_password_change(client, user_headers):
    updated = client.patch(
        "/api/auth/me",
        headers=user_headers,
        json={"name": "Updated Student", "theme": "dark", "default_difficulty": "advanced"},
    )
    assert updated.status_code == 200
    assert updated.json()["theme"] == "dark"
    assert updated.json()["default_difficulty"] == "advanced"

    wrong = client.post(
        "/api/auth/change-password",
        headers=user_headers,
        json={"current_password": "Wrong123", "new_password": "NewPassword123"},
    )
    assert wrong.status_code == 400

    changed = client.post(
        "/api/auth/change-password",
        headers=user_headers,
        json={"current_password": "Password123", "new_password": "NewPassword123"},
    )
    assert changed.status_code == 204

    login = client.post(
        "/api/auth/login",
        json={"email": "student@example.com", "password": "NewPassword123"},
    )
    assert login.status_code == 200


def test_delete_account_removes_data(client, user_headers, project):
    response = client.request(
        "DELETE",
        "/api/auth/me",
        headers=user_headers,
        json={"password": "Password123"},
    )
    assert response.status_code == 204
    login = client.post(
        "/api/auth/login",
        json={"email": "student@example.com", "password": "Password123"},
    )
    assert login.status_code == 401
