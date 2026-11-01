"""Authentication, profile and account deletion endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Response, status
from sqlalchemy import func

from app.api.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.core.security import (
    create_access_token,
    hash_password,
    validate_password_strength,
    verify_password,
)
from app.db.models import Project, User, VivaSession
from app.schemas.auth import (
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
)
from app.services.document_service import delete_project_files

router = APIRouter(prefix="/auth", tags=["authentication"])
logger = logging.getLogger(__name__)


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: DbSession) -> TokenResponse:
    email = payload.email.lower().strip()
    existing = db.query(User).filter(func.lower(User.email) == email).first()
    if existing:
        raise AppError("An account with this email already exists.", 409, "email_taken")
    try:
        validate_password_strength(payload.password)
    except ValueError as exc:
        raise AppError(str(exc), 422, "weak_password") from exc
    user = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Registered user %s", user.id)
    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbSession) -> TokenResponse:
    email = payload.email.lower().strip()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise AppError("Incorrect email or password.", 401, "invalid_credentials")
    if not user.is_active:
        raise AppError("This account has been deactivated.", 403, "account_disabled")
    return TokenResponse(
        access_token=create_access_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.get("/me")
def me(user: CurrentUser, db: DbSession) -> dict:
    project_count = db.query(Project).filter(Project.user_id == user.id).count()
    session_count = db.query(VivaSession).filter(VivaSession.user_id == user.id).count()
    completed = (
        db.query(VivaSession)
        .filter(VivaSession.user_id == user.id, VivaSession.status == "completed")
        .count()
    )
    return {
        **UserOut.model_validate(user).model_dump(mode="json"),
        "project_count": project_count,
        "session_count": session_count,
        "completed_sessions": completed,
    }


@router.patch("/me", response_model=UserOut)
def update_profile(payload: UpdateProfileRequest, user: CurrentUser, db: DbSession) -> UserOut:
    if payload.name is not None:
        name = payload.name.strip()
        if len(name) < 2:
            raise AppError("Name must be at least 2 characters.", 422, "invalid_name")
        user.name = name
    if payload.theme is not None:
        user.theme = payload.theme
    if payload.default_difficulty is not None:
        user.default_difficulty = payload.default_difficulty
    if payload.tts_enabled is not None:
        user.tts_enabled = payload.tts_enabled
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def change_password(payload: ChangePasswordRequest, user: CurrentUser, db: DbSession) -> Response:
    if not verify_password(payload.current_password, user.password_hash):
        raise AppError("Current password is incorrect.", 400, "invalid_password")
    try:
        validate_password_strength(payload.new_password)
    except ValueError as exc:
        raise AppError(str(exc), 422, "weak_password") from exc
    if verify_password(payload.new_password, user.password_hash):
        raise AppError("The new password must be different from the current password.", 422, "same_password")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    logger.info("Password changed for user %s", user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_account(payload: DeleteAccountRequest, user: CurrentUser, db: DbSession) -> Response:
    if not verify_password(payload.password, user.password_hash):
        raise AppError("Password is incorrect. Account was not deleted.", 400, "invalid_password")
    projects = db.query(Project).filter(Project.user_id == user.id).all()
    for project in projects:
        delete_project_files(project)
    db.delete(user)
    db.commit()
    logger.info("Deleted account and all data for user %s", user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
