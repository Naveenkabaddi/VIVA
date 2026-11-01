"""Mock viva orchestration: question flow, adaptive follow-ups, evaluation and reports."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.db.models import (
    Answer,
    Document,
    Evaluation,
    Project,
    Question,
    VivaSession,
)
from app.services.evaluation_service import evaluate_answer
from app.services.question_service import CATEGORIES, DIFFICULTIES, generate_followup, generate_questions
from app.services.rag import cached_overview
from app.services.report_service import (
    generate_report,
    overall_report,
    report_dict,
    session_turns,
)

logger = logging.getLogger(__name__)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def elapsed_minutes(session: VivaSession) -> float:
    start = _aware(session.started_at) or datetime.now(timezone.utc)
    end = _aware(session.paused_at) if session.status == "paused" and session.paused_at else datetime.now(timezone.utc)
    return max(0.0, (end - start).total_seconds() / 60.0)


def serialize_question(question: Question, include_answer: bool = False) -> dict[str, Any]:
    data = {
        "id": question.id,
        "category": question.category,
        "question_text": question.question_text,
        "difficulty": question.difficulty,
        "is_followup": question.is_followup,
        "sequence": question.sequence,
        "source_reference": question.source_reference or {},
        "engine": question.engine,
    }
    if include_answer:
        data["expected_answer"] = question.expected_answer
    return data


def serialize_evaluation(evaluation: Evaluation) -> dict[str, Any]:
    return {
        "id": evaluation.id,
        "answer_id": evaluation.answer_id,
        "technical_accuracy": evaluation.accuracy_score,
        "relevance": evaluation.relevance_score,
        "completeness": evaluation.completeness_score,
        "conceptual_understanding": evaluation.understanding_score,
        "clarity": evaluation.clarity_score,
        "total_score": evaluation.total_score,
        "strengths": evaluation.strengths,
        "missing_concepts": evaluation.missing_concepts,
        "mistakes": evaluation.mistakes,
        "corrected_answer": evaluation.corrected_answer,
        "reference_answer": evaluation.reference_answer,
        "improvement_suggestions": evaluation.improvement_suggestions,
        "source_references": evaluation.source_references,
        "feedback": evaluation.feedback,
        "sufficient_context": evaluation.sufficient_context,
        "engine": evaluation.engine,
        "created_at": evaluation.created_at.isoformat() if evaluation.created_at else None,
    }


def serialize_session(db: Session, session: VivaSession, include_turns: bool = False) -> dict[str, Any]:
    answered = (
        db.query(func.count(Answer.id))
        .filter(Answer.session_id == session.id)
        .scalar()
        or 0
    )
    total_questions = (
        db.query(func.count(Question.id))
        .filter(Question.session_id == session.id)
        .scalar()
        or 0
    )
    current = _current_question(db, session)
    scores = [
        row[0]
        for row in db.query(Evaluation.total_score)
        .filter(Evaluation.session_id == session.id)
        .all()
    ]
    average = round(sum(scores) / len(scores), 1) if scores else None
    project = db.get(Project, session.project_id)
    data: dict[str, Any] = {
        "id": session.id,
        "project_id": session.project_id,
        "project_title": project.title if project else None,
        "difficulty": session.difficulty,
        "duration_minutes": session.duration_minutes,
        "question_count": session.question_count,
        "mode": session.mode,
        "status": session.status,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        "overall_score": session.overall_score if session.overall_score is not None else average,
        "answered_count": answered,
        "total_questions": total_questions,
        "progress": round(answered / max(session.question_count, 1) * 100, 1),
        "elapsed_minutes": round(elapsed_minutes(session), 2),
        "current_question": serialize_question(current) if current else None,
    }
    if include_turns:
        data["turns"] = session_turns(db, session)
    return data


def _current_question(db: Session, session: VivaSession) -> Question | None:
    answered_subq = db.query(Answer.question_id).filter(Answer.session_id == session.id)
    return (
        db.query(Question)
        .filter(
            Question.session_id == session.id,
            ~Question.id.in_(answered_subq),
        )
        .order_by(Question.sequence, Question.id)
        .first()
    )


def start_session(
    db: Session,
    user_id: int,
    project: Project,
    *,
    difficulty: str,
    duration_minutes: int,
    question_count: int,
    mode: str = "text",
    categories: list[str] | None = None,
) -> tuple[VivaSession, Question | None]:
    difficulty = (difficulty or "mixed").lower()
    if difficulty not in DIFFICULTIES + ["mixed"]:
        raise AppError("Difficulty must be basic, intermediate, advanced or mixed.", 422, "invalid_difficulty")
    categories = [c for c in (categories or CATEGORIES) if c in CATEGORIES] or CATEGORIES
    ready = (
        db.query(Document)
        .filter(Document.project_id == project.id, Document.processing_status == "ready")
        .count()
    )
    if ready == 0:
        raise AppError(
            "This project has no successfully processed documents. Upload a PDF, DOCX or TXT report first.",
            409,
            "project_not_ready",
        )

    active = (
        db.query(VivaSession)
        .filter(
            VivaSession.user_id == user_id,
            VivaSession.project_id == project.id,
            VivaSession.status.in_(["active", "paused"]),
        )
        .order_by(VivaSession.id.desc())
        .first()
    )
    if active:
        raise AppError(
            f"You already have an unfinished viva session (#{active.id}) for this project. Resume or end it first.",
            409,
            "active_session_exists",
        )

    overview = cached_overview(db, project)
    questions, engine = generate_questions(
        db,
        project,
        overview,
        difficulty=difficulty,
        categories=categories,
        count=question_count,
    )
    if not questions:
        raise AppError("Could not generate questions for this project.", 500, "question_generation_failed")

    session = VivaSession(
        user_id=user_id,
        project_id=project.id,
        difficulty=difficulty,
        duration_minutes=duration_minutes,
        question_count=len(questions),
        mode=mode if mode in {"text", "voice"} else "text",
        status="active",
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.flush()
    for index, item in enumerate(questions):
        db.add(
            Question(
                project_id=project.id,
                session_id=session.id,
                category=item["category"],
                question_text=item["question"],
                difficulty=item["difficulty"],
                expected_answer=item.get("expected_answer", ""),
                source_reference=item.get("source_reference"),
                is_followup=False,
                sequence=float((index + 1) * 10),
                engine=item.get("engine", engine),
            )
        )
    db.commit()
    db.refresh(session)
    logger.info(
        "Started viva session %s (project=%s, engine=%s, questions=%s)",
        session.id, project.id, engine, len(questions),
    )
    return session, _current_question(db, session)


def _store_evaluation(db: Session, answer: Answer, session: VivaSession, result: dict[str, Any]) -> Evaluation:
    evaluation = Evaluation(
        answer_id=answer.id,
        session_id=session.id,
        accuracy_score=result["technical_accuracy"],
        relevance_score=result["relevance"],
        completeness_score=result["completeness"],
        understanding_score=result["conceptual_understanding"],
        clarity_score=result["clarity"],
        total_score=result["total_score"],
        strengths=result["strengths"],
        missing_concepts=result["missing_concepts"],
        mistakes=result["mistakes"],
        corrected_answer=result["corrected_answer"],
        reference_answer=result["reference_answer"],
        improvement_suggestions=result["improvement_suggestions"],
        source_references=result["source_references"],
        feedback=result["feedback"],
        sufficient_context=result["sufficient_context"],
        engine=result["engine"],
    )
    db.add(evaluation)
    db.flush()
    return evaluation


def _followup_for_question(db: Session, session: VivaSession, sequence: float) -> Question | None:
    return (
        db.query(Question)
        .filter(
            Question.session_id == session.id,
            Question.is_followup.is_(True),
            Question.sequence == sequence + 0.5,
        )
        .first()
    )


def _maybe_insert_followup(
    db: Session,
    session: VivaSession,
    project: Project,
    current: Question,
    result: dict[str, Any],
    history: list[str],
) -> Question | None:
    followup_cap = max(1, min(3, session.question_count // 3))
    existing_extras = (
        db.query(func.count(Question.id))
        .filter(Question.session_id == session.id, Question.is_followup.is_(True))
        .scalar()
        or 0
    )
    if existing_extras >= followup_cap:
        return None
    if _followup_for_question(db, session, current.sequence):
        return None

    score = float(result["total_score"])
    should_followup = score < 65 or (
        score >= 88 and current.difficulty in {"basic", "intermediate"}
    )
    if not should_followup:
        return None

    overview = cached_overview(db, project)
    followup = generate_followup(
        db,
        project,
        overview,
        question=current.question_text,
        answer=result.get("answer_text", ""),
        score=score,
        missing_concepts=result.get("missing_concepts", []),
        category=current.category,
        difficulty=current.difficulty,
        history=history,
    )
    if not followup.get("question") or len(followup["question"].strip()) < 10:
        return None
    question = Question(
        project_id=project.id,
        session_id=session.id,
        category=followup.get("category", current.category),
        question_text=followup["question"],
        difficulty=followup.get("difficulty", current.difficulty),
        expected_answer=followup.get("expected_answer", ""),
        source_reference=followup.get("source_reference"),
        is_followup=True,
        sequence=current.sequence + 0.5,
        engine=followup.get("engine", "heuristic"),
    )
    db.add(question)
    db.flush()
    return question


def submit_answer(
    db: Session,
    session: VivaSession,
    *,
    answer_text: str,
    input_type: str = "text",
) -> dict[str, Any]:
    if session.status == "completed":
        raise AppError("This viva session has already been completed.", 409, "session_completed")
    if session.status == "paused":
        raise AppError("Resume the session before submitting an answer.", 409, "session_paused")
    if not answer_text or not answer_text.strip():
        raise AppError("Answer text cannot be empty.", 422, "empty_answer")

    question = _current_question(db, session)
    if not question:
        report = finalize_session(db, session)
        return {"completed": True, "evaluation": None, "next_question": None, "report": report}

    project = db.get(Project, session.project_id)
    if not project:
        raise AppError("Project not found.", 404, "project_not_found")
    overview = cached_overview(db, project)

    answer = Answer(
        session_id=session.id,
        question_id=question.id,
        answer_text=answer_text.strip()[:12000],
        input_type=input_type if input_type in {"text", "voice"} else "text",
        submitted_at=datetime.now(timezone.utc),
    )
    db.add(answer)
    db.flush()

    history = [
        row[0]
        for row in db.query(Question.question_text)
        .filter(Question.session_id == session.id)
        .order_by(Question.sequence)
        .all()
    ]
    result = evaluate_answer(
        db,
        project,
        overview,
        question_text=question.question_text,
        answer_text=answer.answer_text,
        expected_answer=question.expected_answer,
        category=question.category,
        difficulty=question.difficulty,
        session_id=session.id,
        input_type=answer.input_type,
    )
    evaluation = _store_evaluation(db, answer, session, result)
    db.commit()

    followup = _maybe_insert_followup(db, session, project, question, result, history)
    db.commit()
    db.refresh(session)

    next_question = _current_question(db, session)
    completed = False
    report = None
    if next_question is None:
        report_obj = finalize_session(db, session)
        completed = True
        report = report_obj
        next_question = None
    elif elapsed_minutes(session) >= session.duration_minutes:
        # Time is up after this answer; finish gracefully.
        report_obj = finalize_session(db, session)
        completed = True
        report = report_obj
        next_question = None

    db.refresh(session)
    db.refresh(evaluation)
    return {
        "completed": completed,
        "evaluation": serialize_evaluation(evaluation),
        "evaluation_meta": {
            "question": question.question_text,
            "category": question.category,
            "difficulty": question.difficulty,
            "answer_text": answer.answer_text,
            "reference_answer": result.get("reference_answer", ""),
            "source_reference": question.source_reference,
        },
        "followup_generated": followup is not None,
        "next_question": serialize_question(next_question) if next_question else None,
        "session": serialize_session(db, session),
        "report": report,
    }


def next_question(db: Session, session: VivaSession) -> dict[str, Any]:
    if session.status == "completed":
        report = overall_report(db, session)
        return {
            "completed": True,
            "next_question": None,
            "report": report_dict(report, session_turns(db, session)) if report else None,
        }
    question = _current_question(db, session)
    if not question:
        report = finalize_session(db, session)
        return {"completed": True, "next_question": None, "report": report}
    return {"completed": False, "next_question": serialize_question(question)}


def pause_session(db: Session, session: VivaSession) -> VivaSession:
    if session.status == "completed":
        raise AppError("Session is already completed.", 409, "session_completed")
    if session.status == "active":
        session.status = "paused"
        session.paused_at = datetime.now(timezone.utc)
        db.commit()
    return session


def resume_session(db: Session, session: VivaSession) -> VivaSession:
    if session.status == "completed":
        raise AppError("Session is already completed.", 409, "session_completed")
    if session.status == "paused":
        if session.paused_at:
            paused_for = datetime.now(timezone.utc) - _aware(session.paused_at)
            session.started_at = (_aware(session.started_at) or datetime.now(timezone.utc)) + paused_for
        session.status = "active"
        session.paused_at = None
        db.commit()
    return session


def finalize_session(db: Session, session: VivaSession) -> dict[str, Any]:
    if session.status != "completed":
        scores = [
            row[0]
            for row in db.query(Evaluation.total_score)
            .filter(Evaluation.session_id == session.id)
            .all()
        ]
        session.status = "completed"
        session.completed_at = datetime.now(timezone.utc)
        session.paused_at = None
        session.overall_score = round(sum(scores) / len(scores), 1) if scores else 0.0
        db.commit()
    report = generate_report(db, session)
    db.refresh(session)
    return report_dict(report, session_turns(db, session))


def end_session(db: Session, session: VivaSession) -> dict[str, Any]:
    if session.status == "completed":
        report = overall_report(db, session)
        if not report:
            report = generate_report(db, session)
        return report_dict(report, session_turns(db, session))
    return finalize_session(db, session)
