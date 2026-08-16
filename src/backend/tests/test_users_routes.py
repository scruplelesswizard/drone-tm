import pytest
from app.users.user_deps import create_reset_password_token
from app.users.user_schemas import AuthUser, DbUser
from loguru import logger as log


@pytest.mark.asyncio
async def test_my_info(client):
    """Test the /my-info/ endpoint to ensure a logged-in user can fetch their data."""
    response = await client.get("/api/users/my-info")
    assert response.status_code == 200
    user_info = response.json()

    assert user_info["email_address"] == "admin@hotosm.org"


@pytest.mark.asyncio
async def test_refresh_token(client):
    """Test the /refresh-token endpoint to ensure a new access token can be obtained."""
    response = await client.get("/api/users/refresh-token")
    assert response.status_code == 200
    token_data = response.json()
    assert "access_token" in token_data
    assert "refresh_token" in token_data


@pytest.mark.asyncio
async def test_reset_password_success(client, auth_user):
    """Test successful password reset using a valid token."""
    token = create_reset_password_token(auth_user.email)
    new_password = "QPassword@12334"

    response = await client.post(
        f"/api/users/reset-password?token={token}&new_password={new_password}"
    )

    if response.status_code != 200:
        log.debug("Response:", response.status_code, response.json())

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_get_users_default_returns_list(client):
    """GET /users/ returns a list containing the authenticated user."""
    response = await client.get("/api/users")
    assert response.status_code == 200
    users = response.json()
    assert isinstance(users, list)
    assert any(u["email_address"] == "admin@hotosm.org" for u in users)


@pytest.mark.asyncio
async def test_get_users_respects_limit(client, db, auth_user):
    """GET /users/?limit=N bounds the result set instead of returning everyone."""
    for i in range(3):
        await DbUser.get_or_create_user(
            db,
            AuthUser(
                id=f"20000000000000000{i}",
                email=f"extra-user-{i}@hotosm.org",
                name=f"extra-user-{i}",
            ),
        )

    response = await client.get("/api/users?limit=2")
    assert response.status_code == 200
    assert len(response.json()) == 2


@pytest.mark.asyncio
async def test_get_users_rejects_invalid_limit(client):
    """limit is bounded (1-500); out-of-range values are a validation error, not a silent clamp."""
    response = await client.get("/api/users?limit=0")
    assert response.status_code == 422

    response = await client.get("/api/users?limit=501")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_users_rejects_negative_skip(client):
    """skip must be >= 0."""
    response = await client.get("/api/users?skip=-1")
    assert response.status_code == 422
