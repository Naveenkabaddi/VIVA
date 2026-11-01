"""Mock viva session endpoints."""
from __future__ import annotations

import copy
import logging

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import func

from app.api.deps import CurrentUser, DbSession, get_owned_project, get_owned_session
from app.core.errors import AppError
from app.db.models import Answer, Evaluation, Project, Question, VivaSession
from app.schemas.viva import (
    AnswerRequest,
    AnswerResponse,
    HistoryOut,
    SessionOut,
    StartVivaRequest,
    StartVivaResponse,
)
from app.services.report_service import (
    generate_report,
    overall_report,
    report_dict,
    session_turns,
)
from app.services.viva_service import (
    end_session,
    finalize_session,
    next_question,
    pause_session,
    resume_session,
    serialize_session,
    start_session,
    submit_answer,
)

router = APIRouter(prefix="/viva", tags=["mock viva"])
logger = logging.getLogger(__name__)


def _clean_turns(turns: list[dict]) -> list[dict]:
    cleaned = copy.deepcopy(turns)
    for turn in cleaned:
        if turn.get("answer_id") is None:
            # Never leak the expected answer for an unanswered question.
            turn.pop("expected_answer", None)
    return cleaned


@router.post("/start", response_model=StartVivaResponse, status_code=status.HTTP_201_CREATED)
def start(payload: StartVivaRequest, user: CurrentUser, db: DbSession) -> StartVivaResponse:
    project = get_owned_project(db, user.id, payload.project_id)
    session, question = start_session(
        db,
        user.id,
        project,
        difficulty=payload.difficulty,
        duration_minutes=payload.duration_minutes,
        question_count=payload.question_count,
        mode=payload.mode,
        categories=payload.categories or None,
    )
    from app.services.viva_service import serialize_question

    return StartVivaResponse(
        session=SessionOut.model_validate(serialize_session(db, session)),
        question=serialize_question(question) if question else None,
        engine=question.engine if question else "heuristic",
    )


@router.get("/sessions", response_model=HistoryOut)
def list_sessions(
    user: CurrentUser,
    db: DbSession,
    project_id: int | None = Query(default=None),
    session_status: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=50),
) -> HistoryOut:
    query = db.query(VivaSession).filter(VivaSession.user_id == user.id)
    if project_id:
        get_owned_project(db, user.id, project_id)
        query = query.filter(VivaSession.project_id == project_id)
    if session_status:
        query = query.filter(VivaSession.status == session_status)
    total = query.count()
    sessions = (
        query.order_by(VivaSession.started_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    titles = {
        project.id: project.title
        for project in db.query(Project).filter(Project.user_id == user.id).all()
    }
    answer_counts = dict(
        db.query(Answer.session_id, func.count(Answer.id))
        .filter(Answer.session_id.in_([session.id for session in sessions]))
        .group_by(Answer.session_id)
        .all()
    ) if sessions else {}
    items = []
    for session in sessions:
        items.append(
            {
                "id": session.id,
                "project_id": session.project_id,
                "project_title": titles.get(session.project_id, "Project"),
                "difficulty": session.difficulty,
                "duration_minutes": session.duration_minutes,
                "question_count": session.question_count,
                "mode": session.mode,
                "status": session.status,
                "started_at": session.started_at.isoformat() if session.started_at else None,
                "completed_at": session.completed_at.isoformat() if session.completed_at else None,
                "overall_score": session.overall_score,
                "answered_count": answer_counts.get(session.id, 0),
                "progress": round(
                    answer_counts.get(session.id, 0) / max(session.question_count, 1) * 100, 1
                ),
            }
        )
    return HistoryOut(items=items, total=total, page=page, page_size=page_size)


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: int, user: CurrentUser, db: DbSession) -> SessionOut:
    session = get_owned_session(db, user.id, session_id)
    data = serialize_session(db, session, include_turns=True)
    if data.get("turns"):
        data["turns"] = _clean_turns(data["turns"])
    return SessionOut.model_validate(data)


@router.post("/{session_id}/answer", response_model=AnswerResponse)
def answer(
    session_id: int, payload: AnswerRequest, user: CurrentUser, db: DbSession
) -> AnswerResponse:
    session = get_owned_session(db, user.id, session_id)
    result = submit_answer(
        db, session, answer_text=payload.answer_text, input_type=payload.input_type
    )
    return AnswerResponse.model_validate(result)


@router.get("/{session_id}/next-question")
def get_next_question(session_id: int, user: CurrentUser, db: DbSession) -> dict:
    session = get_owned_session(db, user.id, session_id)
    return next_question(db, session)


@router.post("/{session_id}/pause", response_model=SessionOut)
def pause(session_id: int, user: CurrentUser, db: DbSession) -> SessionOut:
    session = get_owned_session(db, user.id, session_id)
    session = pause_session(db, session)
    return SessionOut.model_validate(serialize_session(db, session))


@router.post("/{session_id}/resume", response_model=SessionOut)
def resume(session_id: int, user: CurrentUser, db: DbSession) -> SessionOut:
    session = get_owned_session(db, user.id, session_id)
    session = resume_session(db, session)
    return SessionOut.model_validate(serialize_session(db, session))


@router.post("/{session_id}/end")
def end(session_id: int, user: CurrentUser, db: DbSession) -> dict:
    session = get_owned_session(db, user.id, session_id)
    return end_session(db, session)


@router.get("/{session_id}/report")
def get_report(session_id: int, user: CurrentUser, db: DbSession) -> dict:
    session = get_owned_session(db, user.id, session_id)
    if session.status != "completed":
        raise AppError(
            "The viva report is available after the session is completed.",
            409,
            "session_not_completed",
        )
    report = overall_report(db, session)
    if not report:
        report = generate_report(db, session)
    return report_dict(report, _clean_turns(session_turns(db, session)))


@router.post("/{session_id}/finalize")
def finalize(session_id: int, user: CurrentUser, db: DbSession) -> dict:
    """Force-generate a report for an active session (admin/testing utility)."""
    session = get_owned_session(db, user.id, session_id)
    if session.status == "completed":
        report = overall_report(db, session)
        if report:
            return report_dict(report, _clean_turns(session_turns(db, session)))
    return finalize_session(db, session)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_session(session_id: int, user: CurrentUser, db: DbSession) -> Response:
    session = get_owned_session(db, user.id, session_id)
    db.delete(session)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
