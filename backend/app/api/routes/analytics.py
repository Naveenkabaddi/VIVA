"""Analytics endpoints computed from stored evaluations."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, get_owned_project
from app.services.analytics_service import compute_analytics

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _filters(
    user: CurrentUser,
    db: DbSession,
    project_id: int | None,
    session_id: int | None,
    difficulty: str | None,
    start_date: datetime | None,
    end_date: datetime | None,
) -> dict:
    if project_id:
        get_owned_project(db, user.id, project_id)
    return compute_analytics(
        db,
        user.id,
        project_id=project_id,
        session_id=session_id,
        difficulty=difficulty,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/dashboard")
def dashboard(
    user: CurrentUser,
    db: DbSession,
    project_id: int | None = Query(default=None),
    session_id: int | None = Query(default=None),
    difficulty: str | None = Query(default=None, pattern="^(basic|intermediate|advanced|mixed)$"),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
) -> dict:
    return _filters(user, db, project_id, session_id, difficulty, start_date, end_date)


@router.get("/performance")
def performance(
    user: CurrentUser,
    db: DbSession,
    project_id: int | None = Query(default=None),
    session_id: int | None = Query(default=None),
    difficulty: str | None = Query(default=None, pattern="^(basic|intermediate|advanced|mixed)$"),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
) -> dict:
    return _filters(user, db, project_id, session_id, difficulty, start_date, end_date)


@router.get("/topics")
def topics(
    user: CurrentUser,
    db: DbSession,
    project_id: int | None = Query(default=None),
    difficulty: str | None = Query(default=None, pattern="^(basic|intermediate|advanced|mixed)$"),
) -> dict:
    data = _filters(user, db, project_id, None, difficulty, None, None)
    return {
        "strong_topics": data["strong_topics"],
        "weak_topics": data["weak_topics"],
        "average_topics": data["average_topics"],
        "category_scores": data["category_scores"],
        "recurring_missing_concepts": data["recurring_missing_concepts"],
        "topic_distribution": data["topic_distribution"],
        "criteria_scores": data["criteria_scores"],
    }
