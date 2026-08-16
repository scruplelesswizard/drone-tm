import pytest
from app.config import Settings
from pydantic import ValidationError


def test_secret_key_required_outside_debug():
    """DEBUG=False with no SECRET_KEY must fail fast, not silently mint one."""
    with pytest.raises(ValidationError, match="SECRET_KEY must be set explicitly"):
        Settings(DEBUG=False, SECRET_KEY=None)


def test_secret_key_explicit_value_preserved():
    """An explicitly configured SECRET_KEY is used as-is outside DEBUG."""
    settings = Settings(DEBUG=False, SECRET_KEY="a-real-production-secret")
    assert settings.SECRET_KEY == "a-real-production-secret"


def test_secret_key_auto_generated_in_debug():
    """DEBUG=True still allows an unset SECRET_KEY, auto-generating one."""
    settings = Settings(DEBUG=True, SECRET_KEY=None)
    assert settings.SECRET_KEY
    assert isinstance(settings.SECRET_KEY, str)
