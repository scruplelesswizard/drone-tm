from uuid import UUID

import pytest
from app.images.image_logic import create_project_image
from app.images.image_schemas import ProjectImageCreate


@pytest.mark.asyncio
async def test_create_project_image_with_location(db, auth_user, create_test_project):
    """lat/lon are passed as query params (not f-string-interpolated) into
    ST_MakePoint - regression test for the SQL-injection-shaped fix."""
    image_data = ProjectImageCreate(
        project_id=UUID(create_test_project),
        filename="test.jpg",
        s3_key="projects/test/test.jpg",
        hash_md5="a" * 32,
        uploaded_by=auth_user.id,
        location={"lat": 27.7172, "lon": 85.324},
    )

    result = await create_project_image(db, image_data)

    assert result.location is not None
    assert result.location["lat"] == pytest.approx(27.7172)
    assert result.location["lon"] == pytest.approx(85.324)


@pytest.mark.asyncio
async def test_create_project_image_without_location(
    db, auth_user, create_test_project
):
    """No location dict at all -> location stays NULL, no error."""
    image_data = ProjectImageCreate(
        project_id=UUID(create_test_project),
        filename="test2.jpg",
        s3_key="projects/test/test2.jpg",
        hash_md5="b" * 32,
        uploaded_by=auth_user.id,
    )

    result = await create_project_image(db, image_data)

    assert result.location is None


@pytest.mark.asyncio
async def test_create_project_image_with_partial_location(
    db, auth_user, create_test_project
):
    """lat present but lon missing must not crash - falls back to NULL
    rather than a partially-built ST_MakePoint call."""
    image_data = ProjectImageCreate(
        project_id=UUID(create_test_project),
        filename="test3.jpg",
        s3_key="projects/test/test3.jpg",
        hash_md5="c" * 32,
        uploaded_by=auth_user.id,
        location={"lat": 27.7172},
    )

    result = await create_project_image(db, image_data)

    assert result.location is None
