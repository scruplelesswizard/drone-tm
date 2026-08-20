from fastapi import FastAPI


def set_sentry_otel_tracer(dsn: str):
    """Add OpenTelemetry tracing only if environment variables configured."""
    from sentry_sdk import init
    from sentry_sdk.integrations.otlp import OTLPIntegration

    init(dsn=dsn, send_default_pii=True, integrations=[OTLPIntegration()])


def instrument_app_otel(app: FastAPI):
    """Add OpenTelemetry FastAPI instrumentation.

    Only used if environment variables configured.
    """
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
    from opentelemetry.instrumentation.requests import RequestsInstrumentor

    FastAPIInstrumentor.instrument_app(app)
    PsycopgInstrumentor().instrument(enable_commenter=True, commenter_options={})
    RequestsInstrumentor().instrument()


def instrument_worker_otel():
    """Add OpenTelemetry instrumentation for the arq worker process.

    Same DB/HTTP instrumentation as instrument_app_otel(), minus
    FastAPIInstrumentor - there's no FastAPI app in the worker process, so
    request/route spans don't apply here. Only used if environment
    variables configured.
    """
    from opentelemetry.instrumentation.psycopg import PsycopgInstrumentor
    from opentelemetry.instrumentation.requests import RequestsInstrumentor

    PsycopgInstrumentor().instrument(enable_commenter=True, commenter_options={})
    RequestsInstrumentor().instrument()
