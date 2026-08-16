import pytest
from app.main import get_application
from fastapi.middleware.cors import CORSMiddleware


def _cors_kwargs():
    app = get_application()
    middleware = next(m for m in app.user_middleware if m.cls is CORSMiddleware)
    return middleware.kwargs


def test_cors_methods_are_scoped_not_wildcarded():
    """allow_methods must be an explicit list - no PUT route exists anywhere,
    and a wildcard here paired with allow_credentials=True is exactly the gap
    this fix closes."""
    methods = set(_cors_kwargs()["allow_methods"])
    assert methods == {"GET", "POST", "PATCH", "DELETE", "OPTIONS"}
    assert "PUT" not in methods
    assert "*" not in methods


def test_cors_headers_are_scoped_not_wildcarded():
    """allow_headers must be an explicit list matching what the API/frontend
    actually send."""
    headers = set(_cors_kwargs()["allow_headers"])
    assert headers == {"Authorization", "Access-Token", "Content-Type", "Accept"}
    assert "*" not in headers


@pytest.mark.asyncio
async def test_preflight_rejects_disallowed_method(client):
    """A CORS preflight for a method outside the scoped list must not be
    granted (no Access-Control-Allow-Methods echoing it back)."""
    response = await client.options(
        "/api/users/",
        headers={
            "Origin": "http://localhost:3040",
            "Access-Control-Request-Method": "PUT",
        },
    )
    allowed = response.headers.get("access-control-allow-methods", "")
    assert "PUT" not in allowed


@pytest.mark.asyncio
async def test_preflight_allows_scoped_method(client):
    """A preflight for a method that's actually in use is granted."""
    response = await client.options(
        "/api/users/",
        headers={
            "Origin": "http://localhost:3040",
            "Access-Control-Request-Method": "GET",
        },
    )
    allowed = response.headers.get("access-control-allow-methods", "")
    assert "GET" in allowed
