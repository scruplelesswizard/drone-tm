from typing import Annotated

from app.db import database
from app.drones import drone_deps, drone_schemas
from app.models.enums import HTTPStatus
from app.shared_schemas import MessageResponse
from app.users.permissions import (
    IsSuperUser,
    check_permissions,
)
from app.users.user_deps import login_required
from app.users.user_schemas import AuthUser
from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection

router = APIRouter(
    prefix="/drones",
    tags=["Drones"],
    responses={404: {"description": "Not found"}},
)


@router.get(
    "",
    response_model=list[drone_schemas.DroneOut],
    summary="List all drones",
)
async def read_drones(
    db: Annotated[Connection, Depends(database.get_db)],
):
    """Get all drones."""
    try:
        return await drone_schemas.DbDrone.all(db)
    except KeyError as e:
        raise HTTPException(status_code=HTTPStatus.NOT_FOUND) from e


@router.post(
    "/create-drone",
    response_model=drone_schemas.DroneCreateResponse,
    summary="Create a new drone",
)
async def create_drone(
    drone_info: drone_schemas.DroneIn,
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: Annotated[AuthUser, Depends(check_permissions(IsSuperUser()))],
):
    """Create a new drone in database"""
    drone_id = await drone_schemas.DbDrone.create(db, drone_info)
    return {"message": "Drone created successfully", "drone_id": drone_id}


@router.delete(
    "/{drone_id}",
    response_model=MessageResponse,
    summary="Delete a drone",
)
async def delete_drone(
    drone: Annotated[drone_schemas.DbDrone, Depends(drone_deps.get_drone_by_id)],
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: Annotated[AuthUser, Depends(check_permissions(IsSuperUser()))],
):
    """Deletes a drone record from the database.

    Args:
        drone_id (int): The ID of the drone to be deleted.
        db (Database, optional): The database session object.
        user_data (AuthUser, optional): The authenticated user data.

    Returns:
        dict: A success message if the drone was deleted.
    """
    drone_id = await drone_schemas.DbDrone.delete(db, drone.id)
    return {"message": f"Drone successfully deleted {drone_id}"}


@router.get(
    "/{drone_id}",
    response_model=drone_schemas.DbDrone,
    summary="Get a drone by ID",
)
async def read_drone(
    drone: Annotated[drone_schemas.DbDrone, Depends(drone_deps.get_drone_by_id)],
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: Annotated[AuthUser, Depends(login_required)],
):
    """Retrieves a drone record from the database.

    Args:
        drone_id (int): The ID of the drone to be retrieved.
        db (Database, optional): The database session object.
        user_data (AuthUser, optional): The authenticated user data.

    Returns:
        dict: The drone record if found.
    """
    return drone


@router.get(
    "/drone-altitude",
    response_model=list[drone_schemas.DroneFlightHeight],
    summary="List drone altitude regulations for all countries",
)
async def get_all_altitudes(
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: Annotated[AuthUser, Depends(login_required)],
):
    """Retrieves all drone altitude regulations."""
    altitudes = await drone_schemas.DroneFlightHeight.all(db)
    if not altitudes:
        return []
    return altitudes


@router.get(
    "/drone-altitude/{country}",
    response_model=drone_schemas.DroneFlightHeight | None,
    summary="Get drone altitude regulations for a country",
)
async def get_drone_altitude_by_country(
    country: str,
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: Annotated[AuthUser, Depends(login_required)],
):
    """Get drone altitude details by country."""
    # DroneFlightHeight.one() already returns None (not []) on no match -
    # response_model=DroneFlightHeight | None handles that directly, so no
    # not-found normalization is needed here.
    return await drone_schemas.DroneFlightHeight.one(db, country)
