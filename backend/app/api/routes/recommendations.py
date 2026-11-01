"""Personalised recommendation endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.api.deps import CurrentUser, DbSession, get_owned_project
from app.core.errors import AppError
from app.db.models import Recommendation
from app.schemas.viva import (
    GenerateRecommendationRequest,
    RecommendationOut,
    RecommendationUpdate,
)
from app.services.recommendation_service import (
    generate_recommendations,
    list_recommendations,
    serialize_recommendation,
)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.get("")
def get_recommendations(
    user: CurrentUser,
    db: DbSession,
    project_id: int | None = Query(default=None),
    rec_status: str | None = Query(default=None, alias="status", pattern="^(open|done)$"),
) -> dict:
    if project_id:
        get_owned_project(db, user.id, project_id)
    items = list_recommendations(db, user.id, project_id=project_id, status=rec_status)
    return {
        "items": [serialize_recommendation(rec) for rec in items],
        "total": len(items),
        "open": sum(1 for rec in items if rec.status == "open"),
        "done": sum(1 for rec in items if rec.status == "done"),
    }


@router.post("/generate")
def generate(payload: GenerateRecommendationRequest, user: CurrentUser, db: DbSession) -> dict:
    if payload.project_id:
        get_owned_project(db, user.id, payload.project_id)
    return generate_recommendations(db, user.id, payload.project_id, use_llm=True)


@router.patch("/{recommendation_id}", response_model=RecommendationOut)
def update_recommendation(
    recommendation_id: int,
    payload: RecommendationUpdate,
    user: CurrentUser,
    db: DbSession,
) -> RecommendationOut:
    rec = (
        db.query(Recommendation)
        .filter(Recommendation.id == recommendation_id, Recommendation.user_id == user.id)
        .first()
    )
    if not rec:
        raise AppError("Recommendation not found.", 404, "recommendation_not_found")
    rec.status = payload.status
    db.commit()
    db.refresh(rec)
    return RecommendationOut.model_validate(serialize_recommendation(rec))


@router.delete("/{recommendation_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_recommendation(recommendation_id: int, user: CurrentUser, db: DbSession) -> Response:
    rec = (
        db.query(Recommendation)
        .filter(Recommendation.id == recommendation_id, Recommendation.user_id == user.id)
        .first()
    )
    if not rec:
        raise AppError("Recommendation not found.", 404, "recommendation_not_found")
    db.delete(rec)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
