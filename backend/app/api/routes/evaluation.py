"""Answer evaluation endpoints (ad-hoc practice and stored records)."""
from __future__ import annotations

from fastapi import APIRouter, Query
from sqlalchemy import func

from app.api.deps import CurrentUser, DbSession, get_owned_project
from app.core.errors import AppError
from app.db.models import Answer, Evaluation, Project, Question, VivaSession
from app.schemas.viva import EvaluateRequest
from app.services.evaluation_service import evaluate_answer as run_evaluation
from app.services.rag import cached_overview
from app.services.viva_service import serialize_evaluation

router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.post("/evaluate")
def evaluate(payload: EvaluateRequest, user: CurrentUser, db: DbSession) -> dict:
    project = get_owned_project(db, user.id, payload.project_id)
    overview = cached_overview(db, project)
    result = run_evaluation(
        db,
        project,
        overview,
        question_text=payload.question,
        answer_text=payload.answer,
        expected_answer=payload.expected_answer,
        category=payload.category,
        difficulty=payload.difficulty,
        input_type="text",
    )
    return result


@router.get("")
def list_evaluations(
    user: CurrentUser,
    db: DbSession,
    session_id: int | None = Query(default=None),
    project_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    query = (
        db.query(Evaluation, Answer, Question, VivaSession)
        .join(Answer, Answer.id == Evaluation.answer_id)
        .join(Question, Question.id == Answer.question_id)
        .join(VivaSession, VivaSession.id == Answer.session_id)
        .filter(VivaSession.user_id == user.id)
    )
    if session_id:
        query = query.filter(Answer.session_id == session_id)
    if project_id:
        query = query.filter(VivaSession.project_id == project_id)
    total = query.count()
    rows = (
        query.order_by(Evaluation.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = []
    for evaluation, answer, question, session in rows:
        items.append(
            {
                "answer_id": answer.id,
                "session_id": session.id,
                "project_id": session.project_id,
                "question": question.question_text,
                "category": question.category,
                "difficulty": question.difficulty,
                "answer_text": answer.answer_text,
                "input_type": answer.input_type,
                "submitted_at": answer.submitted_at.isoformat() if answer.submitted_at else None,
                "evaluation": serialize_evaluation(evaluation),
            }
        )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{answer_id}")
def get_evaluation(answer_id: int, user: CurrentUser, db: DbSession) -> dict:
    row = (
        db.query(Evaluation, Answer, Question, VivaSession, Project)
        .join(Answer, Answer.id == Evaluation.answer_id)
        .join(Question, Question.id == Answer.question_id)
        .join(VivaSession, VivaSession.id == Answer.session_id)
        .join(Project, Project.id == VivaSession.project_id)
        .filter(Answer.id == answer_id, VivaSession.user_id == user.id)
        .first()
    )
    if not row:
        raise AppError("Evaluation not found.", 404, "evaluation_not_found")
    evaluation, answer, question, session, project = row
    return {
        "evaluation": serialize_evaluation(evaluation),
        "question": {
            "id": question.id,
            "question_text": question.question_text,
            "category": question.category,
            "difficulty": question.difficulty,
            "expected_answer": question.expected_answer,
            "source_reference": question.source_reference,
        },
        "answer": {
            "id": answer.id,
            "answer_text": answer.answer_text,
            "input_type": answer.input_type,
            "submitted_at": answer.submitted_at.isoformat() if answer.submitted_at else None,
        },
        "session": {
            "id": session.id,
            "project_id": project.id,
            "project_title": project.title,
            "difficulty": session.difficulty,
            "status": session.status,
        },
    }
