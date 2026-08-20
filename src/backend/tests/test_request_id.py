import uuid

import pytest


@pytest.mark.asyncio
async def test_request_id_is_echoed_back_when_provided(client):
    """A caller-supplied X-Request-ID propagates onto the response, so a
    client-side trace ID survives round-trip."""
    given = str(uuid.uuid4())
    response = await client.get("/api/v1/users/my-info", headers={"X-Request-ID": given})
    assert response.headers["x-request-id"] == given


@pytest.mark.asyncio
async def test_request_id_is_generated_when_absent(client):
    """No X-Request-ID from the caller still results in one on the
    response, so every request is traceable in logs even without a
    cooperating client."""
    response = await client.get("/api/v1/users/my-info")
    assert response.headers.get("x-request-id")


@pytest.mark.asyncio
async def test_request_id_differs_across_requests_when_not_supplied(client):
    """Each unsupplied request gets its own generated ID, not a shared/
    cached one."""
    first = await client.get("/api/v1/users/my-info")
    second = await client.get("/api/v1/users/my-info")
    assert first.headers["x-request-id"] != second.headers["x-request-id"]
