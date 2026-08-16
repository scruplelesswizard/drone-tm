"""RFC 7807 (application/problem+json) error response handlers.

Registered globally in main.py so every unhandled HTTPException, request
validation failure, and unexpected exception gets a consistent response
shape instead of each route hand-rolling its own {"detail": ...} dict.
"""

import http

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger as log


def _problem(status_code: int, detail: str, **extra: object) -> JSONResponse:
    try:
        title = http.HTTPStatus(status_code).phrase
    except ValueError:
        title = "Error"
    return JSONResponse(
        status_code=status_code,
        media_type="application/problem+json",
        content={
            "type": "about:blank",
            "title": title,
            "status": status_code,
            "detail": detail,
            **extra,
        },
    )


async def handle_http_exception(request: Request, exc: HTTPException) -> JSONResponse:
    """Render a raised HTTPException as an RFC 7807 problem+json body."""
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return _problem(exc.status_code, detail)


async def handle_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Render request validation failures as an RFC 7807 problem+json body."""
    return _problem(422, "Request validation failed", errors=exc.errors())


async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all: log the real exception, return a generic problem+json body.

    Never leaks internal exception text to the client - unlike routes that
    put str(e) directly into a response `detail`, which callers should
    migrate away from (see todo.md).
    """
    log.exception(f"Unhandled exception on {request.method} {request.url.path}")
    return _problem(500, "Internal server error")
