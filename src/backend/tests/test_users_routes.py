import uuid

import pytest
from app.db.database import get_db
from app.models.enums import UserRole
from app.users.user_deps import create_reset_password_token, login_required
from app.users.user_schemas import (
    AuthUser,
    BaseUserProfile,
    DbUser,
    DbUserProfile,
    UserProfileCreate,
)
from httpx import ASGITransport, AsyncClient
from loguru import logger as log
from psycopg.rows import dict_row


@pytest.mark.asyncio
async def test_my_info(client):
    """Test the /my-info/ endpoint to ensure a logged-in user can fetch their data."""
    response = await client.get("/api/v1/users/my-info")
    assert response.status_code == 200
    user_info = response.json()

    assert user_info["email_address"] == "admin@hotosm.org"


@pytest.mark.asyncio
async def test_my_info_non_numeric_user_id(app, db):
    """/my-info used to 500 for any user whose id isn't all-digits -
    DbUserProfile.user_id was typed `int` even though the users.id column
    (and DbUser.id) is a plain varchar. Hanko SSO ids are UUIDs, not
    numbers, so this broke every Hanko-authenticated user with a profile;
    it went unnoticed because the only existing coverage (test_my_info,
    the default `client` fixture's auth_user) happens to use a Google-OAuth
    sub id that's all digits and parses as a valid int by accident."""
    non_numeric_user = AuthUser(
        id=str(uuid.uuid4()),
        email=f"hanko-style-user-{uuid.uuid4()}@hotosm.org",
        name="Hanko Style User",
        profile_img="",
        role="PROJECT_CREATOR",
        is_superuser=False,
    )
    await DbUser.get_or_create_user(db, non_numeric_user)
    await DbUserProfile.create(
        db,
        non_numeric_user.id,
        UserProfileCreate(password="SomePassword123!", role=[UserRole.PROJECT_CREATOR]),
    )
    await db.commit()

    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[login_required] = lambda: non_numeric_user

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as test_client:
            response = await test_client.get("/api/v1/users/my-info")
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(login_required, None)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == non_numeric_user.id
    assert body["has_user_profile"] is True
    assert body["user_id"] == non_numeric_user.id


def test_role_parses_known_values_from_postgres_array_literal():
    """psycopg hands the `role` column back as a raw '{A,B}' array literal
    string; the parser should decode every recognized role."""
    profile = BaseUserProfile(role="{PROJECT_CREATOR,DRONE_PILOT}")
    assert set(profile.role) == {"PROJECT_CREATOR", "DRONE_PILOT"}


def test_role_drops_unrecognized_value_instead_of_erroring():
    """`BOTH` is a vestigial Postgres enum value from before roles became an
    array (a user with both roles is now `{PROJECT_CREATOR,DRONE_PILOT}`, two
    elements, not a single `BOTH` sentinel) - it was never re-added to the
    `UserRole` Python enum. A user profile row that somehow still carries it
    (or any other value the Python enum doesn't know about) used to have it
    silently dropped with zero trace, which - combined with the frontend's
    `role.includes(signedInAs)` check - permanently redirected that account
    to /complete-profile on every login with no way to diagnose why. This
    only asserts the parse still succeeds and known roles still come through;
    it does not assert on log output (loguru doesn't route through the
    stdlib `logging` module `caplog` hooks into by default)."""
    profile = BaseUserProfile(role="{PROJECT_CREATOR,BOTH}")
    assert set(profile.role) == {"PROJECT_CREATOR"}


@pytest.mark.asyncio
async def test_refresh_token(client):
    """Test the /refresh-token endpoint to ensure a new access token can be obtained."""
    response = await client.get("/api/v1/users/refresh-token")
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
        f"/api/v1/users/reset-password?token={token}&new_password={new_password}"
    )

    if response.status_code != 200:
        log.debug("Response:", response.status_code, response.json())

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_register_creates_account_and_returns_token(client, db):
    """POST /users/register creates the bare users row + password and logs
    the new account straight in - no user_profile yet, that's still
    /complete-profile's job (this only covers the auth identity)."""
    email = f"new-signup-{uuid.uuid4()}@example.com"
    response = await client.post(
        "/api/v1/users/register",
        json={
            "email_address": email,
            "password": "StrongPass123!",
            "name": "New Signup",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert "refresh_token" in body
    assert body["role"] == "PROJECT_CREATOR"

    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT id, name, password FROM users WHERE email_address = %(email)s;",
            {"email": email},
        )
        row = await cur.fetchone()
    assert row is not None
    assert row["name"] == "New Signup"
    # Hashed, not the plaintext password we sent.
    assert row["password"] != "StrongPass123!"

    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT 1 FROM user_profile WHERE user_id = %(user_id)s;",
            {"user_id": row["id"]},
        )
        profile_row = await cur.fetchone()
    assert profile_row is None


@pytest.mark.asyncio
async def test_register_rejects_duplicate_email(client):
    """A second registration with the same email must fail, not silently
    take over or duplicate the account."""
    email = f"dupe-signup-{uuid.uuid4()}@example.com"
    payload = {
        "email_address": email,
        "password": "StrongPass123!",
        "name": "First Signup",
    }

    first = await client.post("/api/v1/users/register", json=payload)
    assert first.status_code == 200

    second = await client.post("/api/v1/users/register", json=payload)
    assert second.status_code == 400


@pytest.mark.asyncio
async def test_register_rejects_weak_password(client):
    """The password complexity validator (length + upper/lower/digit/
    special char) must reject an obviously weak password rather than
    creating the account anyway."""
    response = await client.post(
        "/api/v1/users/register",
        json={
            "email_address": f"weak-pass-{uuid.uuid4()}@example.com",
            "password": "weak",
            "name": "Weak Password",
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_users_default_returns_envelope(client):
    """GET /users now returns {results, pagination}, not a bare list."""
    response = await client.get("/api/v1/users")
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

    response = await client.get("/api/v1/users?per_page=2")
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 2
    assert body["pagination"]["per_page"] == 2
    assert body["pagination"]["total"] >= 4


@pytest.mark.asyncio
async def test_get_users_rejects_invalid_per_page(client):
    """per_page is bounded (1-100, the shared pagination_params() default);
    out-of-range values are a validation error, not a silent clamp."""
    response = await client.get("/api/v1/users?per_page=0")
    assert response.status_code == 422

    response = await client.get("/api/v1/users?per_page=101")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_get_users_rejects_invalid_page(client):
    """page must be >= 1 (1-indexed, unlike the old skip/limit params)."""
    response = await client.get("/api/v1/users?page=0")
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

    response = await client.get("/api/v1/users/mentionable")
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
        "/api/v1/users/some-other-user-id/profile",
        json={"password": "SomePassword123!"},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_own_profile_allowed(client, auth_user):
    """A user creating their own profile passes the IsSelf check."""
    response = await client.post(
        f"/api/v1/users/{auth_user.id}/profile",
        json={"password": "SomePassword123!"},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_profile_for_another_user_forbidden(client):
    """Same IsSelf gate on the PATCH route."""
    response = await client.patch(
        "/api/v1/users/some-other-user-id/profile",
        json={"city": "Kathmandu"},
    )
    assert response.status_code == 403
