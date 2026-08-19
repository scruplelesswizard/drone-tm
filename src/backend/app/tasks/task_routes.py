import uuid
from datetime import datetime, timezone
from typing import Annotated

from app.db import database
from app.models.enums import HTTPStatus
from app.pagination import PaginationParams, paginate, pagination_params
from app.projects import project_deps, project_schemas
from app.tasks import task_logic, task_schemas
from app.users.user_deps import login_required
from app.users.user_schemas import AuthUser
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from psycopg import Connection
from psycopg.rows import dict_row

router = APIRouter(
    prefix="/tasks",
    tags=["tasks"],
    responses={404: {"description": "Not found"}},
)


async def _resolve_project_id(db: Connection, project_id: str) -> uuid.UUID:
    """Resolve a project identifier (UUID or slug) to a UUID."""
    try:
        return uuid.UUID(str(project_id))
    except ValueError:
        pass
    async with db.cursor(row_factory=dict_row) as cur:
        await cur.execute(
            "SELECT id FROM projects WHERE slug = %(slug)s",
            {"slug": project_id},
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(
                status_code=HTTPStatus.NOT_FOUND, detail="Project not found"
            )
        return row["id"]


@router.get(
    "/project/{project_id}/{task_index}",
    response_model=task_schemas.TaskDetailsOut,
    summary="Get task details by project and index",
)
async def read_task_by_index(
    project_id: str,
    task_index: int,
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: AuthUser = Depends(login_required),
):
    """Retrieve task details by project identifier and task index."""
    resolved_id = await _resolve_project_id(db, project_id)
    return await task_schemas.TaskDetailsOut.get_task_by_project_and_index(
        db, resolved_id, task_index
    )


@router.get(
    "/{task_id}",
    response_model=task_schemas.TaskDetailsOut,
    summary="Get task details by ID",
)
async def read_task(
    task_id: uuid.UUID,
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: AuthUser = Depends(login_required),
):
    """Retrieve details of a specific task by its ID."""
    return await task_schemas.TaskDetailsOut.get_task_details(db, task_id)


@router.get(
    "/statistics",
    response_model=task_schemas.TaskStats,
    summary="Get task statistics for the current user",
)
async def get_task_stats(
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: AuthUser = Depends(login_required),
):
    """Retrieve statistics related to tasks for the authenticated user."""
    return await task_logic.get_task_stats(db, user_data)


@router.get(
    "",
    response_model=task_schemas.TaskListOut,
    summary="List tasks visible to the current user",
)
async def list_tasks(
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: Annotated[AuthUser, Depends(login_required)],
    pagination: Annotated[PaginationParams, Depends(pagination_params)],
):
    """Get all tasks for a user."""
    user_id = user_data.id
    results, total = await task_schemas.UserTasksOut.get_tasks_by_user(
        db, user_id, pagination.skip, pagination.per_page
    )
    return {"results": results, "pagination": paginate(pagination, total)}


@router.get(
    "/states/{project_id}",
    response_model=list[task_schemas.Task],
    summary="Get all task states for a project",
)
async def task_states(
    db: Annotated[Connection, Depends(database.get_db)], project_id: str
):
    """Get all tasks states for a project."""
    resolved_id = await _resolve_project_id(db, project_id)
    return await task_schemas.Task.all(db, resolved_id)


@router.post(
    "/event/{project_id}/{task_id}",
    # handle_event()'s branches don't return a consistent shape - the
    # REQUEST case (request_mapping()) RETURNING-s project_id/task_id/
    # comment with no `state`, while every other case (update_task_state())
    # RETURNING-s project_id/task_id/state/comment. See todo.md.
    response_model=None,
    summary="Record an event transitioning a task's state",
)
async def new_event(
    db: Annotated[Connection, Depends(database.get_db)],
    background_tasks: BackgroundTasks,
    project_id: str,
    task_id: uuid.UUID,
    detail: task_schemas.NewEvent,
    user_data: Annotated[AuthUser, Depends(login_required)],
    project: Annotated[
        project_schemas.DbProject, Depends(project_deps.get_project_by_id)
    ],
):
    user_id = user_data.id
    resolved_project_id = await _resolve_project_id(db, project_id)
    project = project.model_dump()
    user_role = user_data.role
    return await task_logic.handle_event(
        db,
        resolved_project_id,
        task_id,
        user_id,
        project,
        user_role,
        detail,
        user_data,
        background_tasks,
    )


@router.post(
    "/manual-override/{project_id}/{task_id}",
    response_model=task_schemas.TaskEventOut,
    summary="Admin failsafe: force a task into an arbitrary state",
)
async def manual_override_task_state(
    db: Annotated[Connection, Depends(database.get_db)],
    project_id: str,
    task_id: uuid.UUID,
    payload: task_schemas.ManualOverrideRequest,
    user_data: Annotated[AuthUser, Depends(login_required)],
    project: Annotated[
        project_schemas.DbProject, Depends(project_deps.get_project_by_id)
    ],
):
    """Admin failsafe: force a task into an arbitrary state.

    Reserved for the project author to recover stuck tasks when the normal
    state-machine flows (request / fly / unlock / revert) can't get them
    back to a usable state. Inserts a task_events row with a clearly-marked
    "manually overridden" comment so the action is auditable.
    """
    if project.author_id != user_data.id:
        raise HTTPException(
            status_code=HTTPStatus.FORBIDDEN,
            detail="Only the project author can manually override a task state.",
        )

    resolved_project_id = await _resolve_project_id(db, project_id)
    return await task_logic.manual_override_task_state(
        db=db,
        project_id=resolved_project_id,
        task_id=task_id,
        target_state=payload.state,
        actor_user_id=user_data.id,
        actor_name=user_data.name,
        updated_at=payload.updated_at or datetime.now(timezone.utc),
    )
