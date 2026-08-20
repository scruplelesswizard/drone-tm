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
async def test_get_users_default_returns_envelope(client):
    """GET /users now returns {results, pagination}, not a bare list."""
    response = await client.get("/api/users")
    assert response.status_code == 200
    body = response.json()
    assert "results" in body
    assert "pagination" in body
    assert any(u["email_address"] == "admin@hotosm.org" for u in body["results"])


@pytest.mark.asyncio
async def test_get_users_respects_per_page(client, db, auth_user):
    """GET /users?per_page=N bounds the result set instead of returning everyone."""
    for i in range(3):
        await DbUser.get_or_create_user(
            db,
            AuthUser(
                id=f"20000000000000000{i}",
                email=f"extra-user-{i}@hotosm.org",
                name=f"extra-user-{i}",
            ),
        )

    response = await client.get("/api/users?per_page=2")
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 2
    assert body["pagination"]["per_page"] == 2
    assert body["pagination"]["total"] >= 4


@pytest.mark.asyncio
async def test_get_users_rejects_invalid_per_page(client):
    """per_page is bounded (1-100, the shared pagination_params() default);
    out-of-range values are a validation error, not a silent clamp."""
    response = await client.get("/api/users?per_page=0")
    assert response.status_code == 422

    response = await client.get("/api/users?per_page=101")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_users_rejects_invalid_page(client):
    """page must be >= 1 (1-indexed, unlike the old skip/limit params)."""
    response = await client.get("/api/users?page=0")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_mentionable_users_returns_all_unpaginated(client, db, auth_user):
    """GET /users/mentionable is decoupled from GET /users's real
    pagination - it returns every user, field-minimal, in one page."""
    for i in range(3):
        await DbUser.get_or_create_user(
            db,
            AuthUser(
                id=f"30000000000000000{i}",
                email=f"mentionable-user-{i}@hotosm.org",
                name=f"mentionable-user-{i}",
            ),
        )

    response = await client.get("/api/users/mentionable")
    assert response.status_code == 200
    body = response.json()
    assert "results" in body
    assert "pagination" not in body
    assert len(body["results"]) >= 4
    assert any(u["name"] == "admin" for u in body["results"])
    sample = body["results"][0]
    assert set(sample.keys()) == {"id", "name", "profile_img"}


@pytest.mark.asyncio
async def test_create_profile_for_another_user_forbidden(client):
    """The IsSelf permission check must still block creating another user's
    profile, matching the behavior of the inline check it replaced."""
    response = await client.post(
        "/api/users/some-other-user-id/profile",
        json={"password": "SomePassword123!"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_own_profile_allowed(client, auth_user):
    """A user creating their own profile passes the IsSelf check."""
    response = await client.post(
        f"/api/users/{auth_user.id}/profile",
        json={"password": "SomePassword123!"},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_profile_for_another_user_forbidden(client):
    """Same IsSelf gate on the PATCH route."""
    response = await client.patch(
        "/api/users/some-other-user-id/profile",
        json={"city": "Kathmandu"},
    )
    assert response.status_code == 403
