"""Analytics computed from stored evaluations — no hardcoded dashboard values."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import (
    Answer,
    Document,
    Evaluation,
    Project,
    Question,
    Recommendation,
    VivaSession,
)
from app.core.config import settings

VERDICT_STRONG = 75.0
VERDICT_WEAK = 50.0


def _verdict(score: float) -> str:
    if score >= VERDICT_STRONG:
        return "strong"
    if score < VERDICT_WEAK:
        return "weak"
    return "average"


def _performance_label(score: float) -> str:
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Strong"
    if score >= 55:
        return "Developing"
    if score > 0:
        return "Needs work"
    return "Not started"


def _overall(session: VivaSession) -> float | None:
    return session.overall_score


def compute_analytics(
    db: Session,
    user_id: int,
    *,
    project_id: int | None = None,
    session_id: int | None = None,
    difficulty: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict[str, Any]:
    session_query = db.query(VivaSession).filter(VivaSession.user_id == user_id)
    if project_id:
        session_query = session_query.filter(VivaSession.project_id == project_id)
    if session_id:
        session_query = session_query.filter(VivaSession.id == session_id)
    if difficulty:
        session_query = session_query.filter(VivaSession.difficulty == difficulty)
    if start_date:
        session_query = session_query.filter(VivaSession.started_at >= start_date)
    if end_date:
        session_query = session_query.filter(VivaSession.started_at <= end_date)
    sessions = session_query.order_by(VivaSession.started_at.desc()).all()
    session_ids = [session.id for session in sessions]

    records: list[tuple[Question, Answer, Evaluation, VivaSession]] = []
    if session_ids:
        rows = (
            db.query(Question, Answer, Evaluation, VivaSession)
            .join(Answer, Answer.question_id == Question.id)
            .join(Evaluation, Evaluation.answer_id == Answer.id)
            .join(VivaSession, VivaSession.id == Answer.session_id)
            .filter(VivaSession.id.in_(session_ids))
            .order_by(Answer.submitted_at.asc())
            .all()
        )
        records = rows

    if difficulty:
        records = [row for row in records if row[0].difficulty == difficulty]

    scores = [float(row[2].total_score) for row in records]
    average = round(sum(scores) / len(scores), 1) if scores else 0.0
    highest_answer = round(max(scores), 1) if scores else 0.0
    completed = [s for s in sessions if s.status == "completed"]
    session_scores = [s.overall_score for s in completed if s.overall_score is not None]
    highest_session = round(max(session_scores), 1) if session_scores else 0.0

    category_buckets: dict[str, list[float]] = defaultdict(list)
    difficulty_buckets: dict[str, list[float]] = defaultdict(list)
    for question, _, evaluation, _ in records:
        category_buckets[question.category].append(float(evaluation.total_score))
        difficulty_buckets[question.difficulty].append(float(evaluation.total_score))

    category_scores = [
        {
            "category": category,
            "average_score": round(sum(values) / len(values), 1),
            "attempts": len(values),
            "verdict": _verdict(sum(values) / len(values)),
        }
        for category, values in category_buckets.items()
    ]
    category_scores.sort(key=lambda item: item["average_score"], reverse=True)

    difficulty_scores = [
        {
            "difficulty": level,
            "average_score": round(sum(values) / len(values), 1),
            "attempts": len(values),
        }
        for level, values in difficulty_buckets.items()
    ]
    order = {"basic": 0, "intermediate": 1, "advanced": 2}
    difficulty_scores.sort(key=lambda item: order.get(item["difficulty"], 3))

    criteria = {
        "technical_accuracy": [float(row[2].accuracy_score) for row in records],
        "relevance": [float(row[2].relevance_score) for row in records],
        "completeness": [float(row[2].completeness_score) for row in records],
        "conceptual_understanding": [float(row[2].understanding_score) for row in records],
        "clarity": [float(row[2].clarity_score) for row in records],
    }
    criteria_scores = [
        {
            "criterion": key.replace("_", " ").title(),
            "key": key,
            "score": round(sum(values) / len(values), 1) if values else 0.0,
        }
        for key, values in criteria.items()
    ]

    session_trend = []
    for session in sorted(sessions, key=lambda item: item.started_at or datetime.min):
        session_records = [row for row in records if row[3].id == session.id]
        if not session_records and session.overall_score is None:
            continue
        avg = (
            round(sum(float(row[2].total_score) for row in session_records) / len(session_records), 1)
            if session_records
            else round(float(session.overall_score or 0), 1)
        )
        project = db.get(Project, session.project_id)
        session_trend.append(
            {
                "session_id": session.id,
                "date": session.started_at.isoformat() if session.started_at else None,
                "score": avg,
                "difficulty": session.difficulty,
                "status": session.status,
                "project": project.title if project else "",
            }
        )

    improvement = None
    if len(session_trend) >= 2:
        improvement = round(session_trend[-1]["score"] - session_trend[-2]["score"], 1)

    strong_topics = [item["category"] for item in category_scores if item["verdict"] == "strong"]
    weak_topics = [item["category"] for item in category_scores if item["verdict"] == "weak"]
    average_topics = [item["category"] for item in category_scores if item["verdict"] == "average"]

    missing_counter: Counter[str] = Counter()
    for _, _, evaluation, _ in records:
        for concept in evaluation.missing_concepts or []:
            missing_counter[concept] += 1
    recurring_missing = [
        {"concept": concept, "count": count}
        for concept, count in missing_counter.most_common(10)
    ]

    total_projects = db.query(Project).filter(Project.user_id == user_id).count()
    total_documents = (
        db.query(Document)
        .join(Project, Project.id == Document.project_id)
        .filter(Project.user_id == user_id, Document.processing_status == "ready")
        .count()
    )
    open_recommendations = (
        db.query(Recommendation)
        .filter(Recommendation.user_id == user_id, Recommendation.status == "open")
        .count()
    )
    active_session = (
        db.query(VivaSession)
        .filter(VivaSession.user_id == user_id, VivaSession.status.in_(["active", "paused"]))
        .order_by(VivaSession.started_at.desc())
        .first()
    )

    project_titles = {
        project.id: project.title
        for project in db.query(Project).filter(Project.user_id == user_id).all()
    }
    recent_sessions = [
        {
            "id": session.id,
            "project_id": session.project_id,
            "project_title": project_titles.get(session.project_id, "Project"),
            "difficulty": session.difficulty,
            "status": session.status,
            "mode": session.mode,
            "question_count": session.question_count,
            "overall_score": session.overall_score,
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        }
        for session in sessions[:8]
    ]

    return {
        "summary": {
            "total_sessions": len(sessions),
            "completed_sessions": len(completed),
            "total_questions": len(records),
            "average_score": average,
            "highest_answer_score": highest_answer,
            "highest_session_score": highest_session,
            "overall_performance": _performance_label(average),
            "overall_score": average,
            "improvement": improvement,
            "total_projects": total_projects,
            "ready_documents": total_documents,
            "open_recommendations": open_recommendations,
            "strong_topic_count": len(strong_topics),
            "weak_topic_count": len(weak_topics),
        },
        "strong_topics": strong_topics[:8],
        "weak_topics": weak_topics[:8],
        "average_topics": average_topics[:8],
        "category_scores": category_scores,
        "difficulty_scores": difficulty_scores,
        "criteria_scores": criteria_scores,
        "trend": session_trend,
        "topic_distribution": [
            {"name": "Strong", "value": len(strong_topics), "color": "#10b981"},
            {"name": "Average", "value": len(average_topics), "color": "#f59e0b"},
            {"name": "Weak", "value": len(weak_topics), "color": "#f43f5e"},
        ],
        "recurring_missing_concepts": recurring_missing,
        "recent_sessions": recent_sessions,
        "active_session": (
            {
                "id": active_session.id,
                "project_id": active_session.project_id,
                "project_title": project_titles.get(active_session.project_id, "Project"),
                "status": active_session.status,
                "difficulty": active_session.difficulty,
                "question_count": active_session.question_count,
            }
            if active_session
            else None
        ),
        "filters": {
            "project_id": project_id,
            "session_id": session_id,
            "difficulty": difficulty,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        "scoring_weights": settings.score_weights,
        "ai_mode": "gemini" if settings.llm_enabled else "offline",
    }
