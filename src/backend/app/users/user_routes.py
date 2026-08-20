import base64
import os
import uuid
from typing import Annotated

import jwt
from app.config import get_password_hash, settings, verify_password
from app.db import database
from app.models.enums import HTTPStatus
from app.pagination import PaginationParams, paginate
from app.users import user_deps, user_logic, user_schemas
from app.users.permissions import IsSelf, check_permissions
from app.users.user_deps import (
    get_user_id_from_path,
    init_google_auth,
    login_required,
)
from app.users.user_schemas import (
    AuthUser,
    Base64Request,
    DbUser,
    DbUserProfile,
    Token,
    UserProfileCreate,
    UserProfileUpdate,
)
from app.utils import send_reset_password_email
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Form,
    HTTPException,
    Query,
    Request,
)
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from loguru import logger as log
from psycopg import Connection
from psycopg.rows import class_row
from pydantic import EmailStr

if settings.DEBUG:
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"


router = APIRouter(
    prefix="/users",
    tags=["users"],
    responses={404: {"description": "Not found"}},
)


@router.post(
    "/login",
    response_model=Token,
    summary="Log in with username/password, get an access token",
)
async def login_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Connection, Depends(database.get_db)],
    role: str = Form(...),
) -> Token:
    """OAuth2 compatible token login, get an access token for future requests"""
    user = await user_logic.authenticate(db, form_data.username, form_data.password)

    if not user:
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    elif not user.get("is_active"):
        raise HTTPException(status_code=400, detail="Inactive user")

    user_info = {
        "id": user.get("id"),
        "email": user.get("email_address"),
        "name": user.get("name"),
        "profile_img": user.get("profile_img"),
        "role": role,
    }

    access_token, refresh_token = await user_logic.create_access_token(user_info)

    return Token(access_token=access_token, refresh_token=refresh_token, role=role)


@router.get(
    "",
    tags=["users"],
    response_model=user_schemas.UserListOut,
    summary="List users",
)
async def get_user(
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: Annotated[AuthUser, Depends(login_required)],
    # Bounds/default deliberately differ from the shared pagination_params()
    # dependency: existing callers (e.g. the user-mention picker) expect
    # "all users" back in one page. Revisit once a dedicated paged UI lands.
    page: Annotated[int, Query(ge=1)] = 1,
    per_page: Annotated[int, Query(gt=0, le=500)] = 200,
):
    pagination = PaginationParams(page=page, per_page=per_page)
    results, total = await user_schemas.DbUser.all(
        db, pagination.skip, pagination.per_page
    )
    return {"results": results, "pagination": paginate(pagination, total)}


@router.post(
    "/{user_id}/profile",
    # Returns a raw JSONResponse - FastAPI passes Response instances through
    # untouched, bypassing response_model entirely, so leaving this unset
    # is the honest state rather than a gap.
    response_model=None,
    summary="Create a user profile",
)
async def create_user_profile(
    user_id: str,
    profile_update: UserProfileCreate,
    db: Annotated[Connection, Depends(database.get_db)],
    _: Annotated[
        str, Depends(check_permissions(IsSelf(), get_obj=get_user_id_from_path))
    ],
):
    """Create user profile based on provided user_id and profile_update data.

    Args:
        user_id (int): The ID of the user whose profile is being updated.
        profile_update (UserProfileUpdate): Updated profile data to apply.

    Returns:
        dict: Updated user profile information.

    Raises:
        HTTPException: If user with given user_id is not found in the database.
    """
    user = await user_schemas.DbUserProfile.create(db, user_id, profile_update)
    return JSONResponse(
        status_code=HTTPStatus.OK,
        content={"message": "User profile updated successfully", "results": user},
    )


@router.patch(
    "/{user_id}/profile",
    response_model=None,  # raw JSONResponse - see create_user_profile above
    summary="Update a user profile",
)
async def update_user_profile(
    user_id: str,
    profile_update: UserProfileUpdate,
    db: Annotated[Connection, Depends(database.get_db)],
    _: Annotated[
        str, Depends(check_permissions(IsSelf(), get_obj=get_user_id_from_path))
    ],
):
    """Update user profile based on provided user_id and profile_update data.

    Args:
        user_id (int): The ID of the user whose profile is being updated.
        profile_update (UserProfileUpdate): Updated profile data to apply.

    Returns:
        dict: Updated user profile information.

    Raises:
        HTTPException: If user with given user_id is not found in the database.
    """
    user = await user_schemas.DbUser.get_user_by_id(db, user_id)
    if profile_update.old_password and profile_update.password:
        # Check if user has a local password (not SSO user)
        if not user.get("password"):
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST,
                detail="Cannot change password for SSO users. Password is managed by the SSO provider.",
            )
        if not verify_password(profile_update.old_password, user.get("password")):
            raise HTTPException(
                status_code=HTTPStatus.BAD_REQUEST,
                detail="Old password is incorrect",
            )
    user = await user_schemas.DbUserProfile.update(db, user_id, profile_update)
    return JSONResponse(
        status_code=HTTPStatus.OK,
        content={"message": "User profile updated successfully", "results": user},
    )


@router.get(
    "/google-login",
    response_model=None,  # raw JSONResponse wrapping a bare URL string
    summary="Get the Google OAuth login URL",
)
async def login_url(google_auth=Depends(init_google_auth)):
    """Get Login URL for Google Oauth Application.

    The application must be registered on google oauth.
    Open the download url returned to get access_token.

    Args:
        request: The GET request.
        google_auth: The Auth object.

    Returns:
        login_url (string): URL to authorize user in Google OAuth.
            Includes URL params: client_id, redirect_uri, permission scope.
    """
    login_url = google_auth.login()
    log.debug(f"Login URL returned: {login_url}")
    return JSONResponse(content=login_url, status_code=200)


@router.get(
    "/callback",
    response_model=Token,
    summary="Complete Google OAuth token exchange",
)
async def callback(
    request: Request,
    role: str,
    google_auth=Depends(init_google_auth),
):
    """Performs token exchange between Google and DTM API"""
    # Build the OAuth authorization_response using the *registered* redirect URI.
    # The frontend receives `code`/`state` at GOOGLE_LOGIN_REDIRECT_URI, then forwards them here.
    # OAuth libraries expect the authorization_response to match the registered redirect URI,
    # not this backend endpoint.
    code = request.query_params.get("code")
    state = request.query_params.get("state")
    callback_url = f"{settings.GOOGLE_LOGIN_REDIRECT_URI}?code={code}&state={state}"
    access_token = google_auth.callback(callback_url, role).get("access_token")

    user_data = google_auth.deserialize_access_token(access_token)

    access_token, refresh_token = await user_logic.create_access_token(user_data)

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        role=role,
    )


@router.get(
    "/refresh-token",
    response_model=Token,
    summary="Refresh an access token",
)
async def update_token(user_data: Annotated[AuthUser, Depends(login_required)]):
    """Refresh access token"""
    access_token, refresh_token = await user_logic.create_access_token(
        user_data.model_dump()
    )
    return Token(
        access_token=access_token, refresh_token=refresh_token, role=user_data.role
    )


@router.get(
    "/my-info",
    # user_info.model_dump() merged with an optional profile's
    # model_dump() plus a bool flag - not modeled as one schema since the
    # merge means the actual field set genuinely varies by user; needs a
    # dedicated review pass, not a guessed response_model.
    summary="Get the current user's info from their access token",
)
async def my_data(
    db: Annotated[Connection, Depends(database.get_db)],
    user_data: Annotated[AuthUser, Depends(login_required)],
):
    """Read access token and get user details from Google"""
    # Get or create user info
    user_info = await user_schemas.DbUser.get_or_create_user(db, user_data)
    # Check if user profile exists
    has_user_profile = await user_schemas.DbUserProfile.get_userprofile_by_userid(
        db, user_info.id
    )

    # Convert user info to dictionary and add profile existence flag
    user_info_dict = user_info.model_dump()
    user_info_dict["has_user_profile"] = bool(has_user_profile)

    # Merge user profile if it exists
    if has_user_profile:
        user_info_dict.update(has_user_profile.model_dump())

    return user_info_dict


@router.post(
    "/forgot-password",
    response_model=None,  # raw JSONResponse - see create_user_profile above
    summary="Request a password reset email",
)
async def forgot_password(
    db: Annotated[Connection, Depends(database.get_db)],
    email: Annotated[EmailStr, Form()],
    background_tasks: BackgroundTasks,
):
    user = await DbUser.get_user_by_email(db, email)
    token = user_deps.create_reset_password_token(user["email_address"])
    # Store the token in the database (or other storage mechanism) FIXME it is necessary to save reset password token.
    # user["reset_password_token"] = token
    background_tasks.add_task(send_reset_password_email, user["email_address"], token)

    return JSONResponse(
        content={"detail": "Password reset email sent"}, status_code=200
    )


@router.post(
    "/reset-password",
    response_model=None,  # raw JSONResponse - see create_user_profile above
    summary="Reset a password using a reset token",
)
async def reset_password(
    db: Annotated[Connection, Depends(database.get_db)], token: str, new_password: str
):
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        email = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=HTTPStatus.UNAUTHORIZED, detail="Invalid token"
            )

        user = await DbUser.get_user_by_email(db, email)
        if not user:
            raise HTTPException(
                status_code=HTTPStatus.NOT_FOUND, detail="User not found"
            )

        # Update password within a transaction
        async with db.transaction(), db.cursor() as cur:
            await cur.execute(
                """
                        UPDATE users
                        SET password = %(password)s
                        WHERE id = %(user_id)s;
                    """,
                {
                    "password": get_password_hash(new_password),
                    "user_id": user.get("id"),
                },
            )

    except jwt.ExpiredSignatureError as e:
        raise HTTPException(
            status_code=HTTPStatus.UNAUTHORIZED, detail="Token expired"
        ) from e
    except jwt.JWTError as e:
        raise HTTPException(
            status_code=HTTPStatus.UNAUTHORIZED, detail="Invalid token"
        ) from e
    except Exception as e:
        log.exception("Failed to reset password")
        raise HTTPException(
            status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
            detail="Failed to reset password",
        ) from e

    return JSONResponse(
        content={"detail": "Your password has been successfully reset!"},
        status_code=200,
    )


@router.post(
    "/regulator",
    tags=["regulator"],
    response_model=Token,
    summary="Create or update a regulator account and log in",
)
async def regulator_create(
    db: Annotated[Connection, Depends(database.get_db)], data: Base64Request
):
    """Automatically create or update a regulator account.
    If the email exists in the database, update the role and related fields.
    Otherwise, create a new user with default dummy data.
    """
    try:
        email = base64.urlsafe_b64decode(data.token.encode()).decode()
        existing_user = await DbUser.get_user_by_email(db, email)
        if existing_user:
            await DbUserProfile._update_roles(
                db, user_id=existing_user["id"], new_roles=["REGULATOR"]
            )
            user_data = {
                "id": existing_user["id"],
                "email": existing_user["email_address"],
                "name": existing_user["name"],
                "profile_img": existing_user["profile_img"],
                "role": "REGULATOR",
            }
        else:
            sql = """
            INSERT INTO users (
                id, name, email_address, password, is_active, is_superuser, profile_img,date_registered
            )
            VALUES (
                %(user_id)s, %(name)s, %(email_address)s, %(password)s,  True, False, now(), %(profile_img)s
            )
            RETURNING *
            """
            async with db.cursor(row_factory=class_row(DbUser)) as cur:
                await cur.execute(
                    sql,
                    {
                        "user_id": uuid.uuid4().int,
                        "name": email,
                        "email_address": email,
                        "password": get_password_hash(email),
                        "profile_img": None,
                    },
                )
                user_data = await cur.fetchone()

            user_profile_sql = """
            INSERT INTO user_profile (
                user_id, role, phone_number, country, city
            )
            VALUES (
                %(user_id)s, %(role)s, %(phone_number)s, %(country)s, %(city)s
            )
            """

            async with db.cursor() as cur:
                await cur.execute(
                    user_profile_sql,
                    {
                        "user_id": user_data.id,
                        "role": ["REGULATOR"],
                        "phone_number": "9866666666",
                        "country": "Nepal",
                        "city": "Kathmandu",
                    },
                )

            user_data = {
                "id": user_data.id,
                "email": user_data.email_address,
                "name": user_data.name,
                "profile_img": user_data.profile_img,
                "role": "REGULATOR",
            }

        access_token, refresh_token = await user_logic.create_access_token(user_data)
        return Token(
            access_token=access_token,
            refresh_token=refresh_token,
            role="REGULATOR",
        )
    except Exception as e:
        log.exception("Failed to log in regulator")
        raise HTTPException(
            status_code=HTTPStatus.BAD_REQUEST,
            detail="Failed to log in regulator",
        ) from e
