import pytest
from app.problem_details import handle_unexpected_error
from starlette.requests import Request


def _make_request() -> Request:
    return Request(
        scope={
            "type": "http",
            "method": "GET",
            "path": "/api/v1/whatever",
            "headers": [],
            "query_string": b"",
        }
    )


@pytest.mark.asyncio
async def test_http_exception_returns_problem_json_shape(client):
    """An HTTPException raised deep in a dependency (unknown project slug)
    comes back as an RFC 7807 problem+json body, not a bare {"detail": ...}."""
    response = await client.get("/api/v1/projects/does-not-exist-slug")
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert body["status"] == response.status_code
    assert "title" in body
    assert "detail" in body


@pytest.mark.asyncio
async def test_validation_error_includes_field_errors(client, create_test_project):
    """A request validation failure (422) includes the field-level errors,
    not just a generic message."""
    project_id = create_test_project
    response = await client.post(
        f"/api/v1/projects/regulator/comment/{project_id}",
        json={"regulator_comment": "x", "regulator_approval_status": "NOT_A_STATUS"},
    )
    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    body = response.json()
    assert "errors" in body
    assert isinstance(body["errors"], list)


@pytest.mark.asyncio
async def test_unexpected_error_never_leaks_exception_text():
    """The catch-all handler must never put the real exception message in
    the client-facing response - the whole point of adding it."""
    secret = "db password=hunter2, do not leak this"
    exc = RuntimeError(secret)

    response = await handle_unexpected_error(_make_request(), exc)

    assert response.status_code == 500
    body = response.body.decode()
    assert secret not in body
    assert "Internal server error" in body


@pytest.mark.asyncio
async def test_unexpected_error_response_is_problem_json():
    """Shape check: still RFC 7807, even for the catch-all path."""
    response = await handle_unexpected_error(_make_request(), RuntimeError("boom"))
    assert response.status_code == 500
    assert response.media_type == "application/problem+json"


def test_catch_all_handler_not_registered_in_debug_mode():
    """In DEBUG mode, unhandled exceptions should hit Starlette's
    interactive traceback page, not be swallowed into a generic 500 - the
    catch-all handler is only registered when DEBUG is off."""
    from app.main import get_application

    app = get_application()
    is_registered = Exception in app.exception_handlers
    assert is_registered == (not app.debug)
