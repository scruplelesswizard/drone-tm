"""Covers with_request_id_context() - the single choke point that binds an
enqueuing request's X-Request-ID to a job's log context, rather than
touching every worker function body. See RequestIDMiddleware in main.py
for the other half of this chain.
"""

import pytest
from app.arq.tasks import with_request_id_context
from loguru import logger as log


@pytest.mark.asyncio
async def test_wrapper_binds_request_id_to_log_context_and_strips_it_from_kwargs():
    received_kwargs = {}
    captured_records = []
    sink_id = log.add(lambda msg: captured_records.append(msg.record), level="INFO")

    async def fake_job(ctx, project_id, **kwargs):
        received_kwargs.update(kwargs)
        log.info("job ran")
        return "ok"

    try:
        wrapped = with_request_id_context(fake_job)
        result = await wrapped(
            {"job_id": "test"}, "proj-1", extra_flag=True, request_id="req-abc-123"
        )
    finally:
        log.remove(sink_id)

    assert result == "ok"
    # request_id must not leak through to the wrapped function's own kwargs -
    # none of the real worker functions declare a request_id parameter.
    assert received_kwargs == {"extra_flag": True}
    assert captured_records, "job's log call should have been captured"
    assert captured_records[-1]["extra"]["request_id"] == "req-abc-123"


@pytest.mark.asyncio
async def test_wrapper_is_a_noop_when_no_request_id_given():
    """Cron jobs and scripts never pass request_id - the wrapper must not
    require it or otherwise change behavior when it's absent."""
    received_kwargs = {}

    async def fake_job(ctx, **kwargs):
        received_kwargs.update(kwargs)
        return "ok"

    wrapped = with_request_id_context(fake_job)
    result = await wrapped({"job_id": "test"})

    assert result == "ok"
    assert received_kwargs == {}


@pytest.mark.asyncio
async def test_wrapper_preserves_function_identity_for_arq_dispatch():
    """arq's function registry dispatches on __qualname__ (see arq.worker.func()) -
    functools.wraps must preserve it so enqueue_job("name", ...) still resolves."""

    async def sample_worker(ctx, **kwargs):
        return None

    wrapped = with_request_id_context(sample_worker)

    assert wrapped.__qualname__ == sample_worker.__qualname__
    assert wrapped.__name__ == sample_worker.__name__
