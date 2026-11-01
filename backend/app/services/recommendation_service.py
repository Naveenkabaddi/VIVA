"""Personalised, evidence-based learning recommendations and adaptive difficulty."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.db.models import Project, Recommendation
from app.schemas.llm import LLMRecommendationList
from app.services.analytics_service import compute_analytics
from app.services.llm import LLMUnavailableError, gemini
from app.services.prompts import recommendations_prompt
from app.services.rag import build_overview

logger = logging.getLogger(__name__)

CATEGORY_ADVICE = {
    "Project Introduction": "Rehearse a 90-second project walkthrough: problem, users, workflow, technologies and outcome. Record yourself and remove vague claims.",
    "Problem Statement": "Write the problem statement in one quantified paragraph and contrast it with two existing approaches.",
    "Objectives": "Map each objective to a measurable artefact (module, metric or test) so you can prove it was achieved.",
    "Literature Review": "Prepare a comparison table of 3 related works with their limitations and explain exactly how your project differs.",
    "Technical Concepts": "Revise the core technology from first principles, then explain why it fits this project better than one alternative.",
    "Algorithms and Models": "Revise the algorithm's inputs, training/processing steps, parameters, failure modes and evaluation metrics.",
    "System Architecture": "Draw your architecture from memory, then explain module responsibilities, data flow and failure handling.",
    "Implementation": "Prepare a 'hardest bug' story: symptom, diagnosis, fix and verification. Keep it concrete.",
    "Database Design": "Revise entities, relationships, keys, normalisation and the indexes that support your most frequent query.",
    "Testing": "Prepare a test matrix (unit, integration, acceptance) with at least one expected-vs-actual example.",
    "Results": "Collect quantified evidence: accuracy, latency, coverage or user feedback. Be ready to explain the baseline.",
    "Real-World Applications": "Identify two concrete users and the operational, privacy and cost requirements for real deployment.",
    "Limitations": "Prepare an honest limitations list, distinguishing data, technical and evaluation limitations.",
    "Future Scope": "Prioritise three enhancements by impact and risk, and justify the order.",
}

PRACTICE_QUESTIONS = {
    "Project Introduction": [
        "Explain your project in 60 seconds without using notes.",
        "What would a non-technical user misunderstand about your project, and how would you clarify it?",
    ],
    "Problem Statement": [
        "State the problem your project solves and quantify its impact.",
        "Why can't an existing tool solve this problem adequately?",
    ],
    "Objectives": [
        "Which objective was hardest to meet, and what evidence proves you met it?",
        "How would you measure success if you had one more month?",
    ],
    "Literature Review": [
        "Compare your approach with the closest existing system.",
        "Which limitation of prior work did you deliberately address?",
    ],
    "Technical Concepts": [
        "Explain your core technology from first principles.",
        "Why is this technology a better fit than its main alternative?",
    ],
    "Algorithms and Models": [
        "Walk through your algorithm from input to output.",
        "What are the failure modes of your model, and how would you detect them?",
    ],
    "System Architecture": [
        "Draw and explain your architecture from memory.",
        "Which component would fail first under 3x load, and why?",
    ],
    "Implementation": [
        "Describe the hardest bug you fixed and how you verified the fix.",
        "How does your code handle invalid input and unexpected failures?",
    ],
    "Database Design": [
        "Explain your schema, keys and relationships.",
        "Which index is most important for performance, and why?",
    ],
    "Testing": [
        "Give one unit, one integration and one acceptance test for your project.",
        "What important behaviour is not covered by your tests?",
    ],
    "Results": [
        "Present your main result and the baseline you compared against.",
        "Which factor could bias your results, and how did you control it?",
    ],
    "Real-World Applications": [
        "Describe two real deployment scenarios and their requirements.",
        "What would prevent a real user from adopting your system?",
    ],
    "Limitations": [
        "List your three biggest limitations and their impact.",
        "Which limitation would you fix first and why?",
    ],
    "Future Scope": [
        "Prioritise three future enhancements by impact and risk.",
        "What architectural change would you make in version two?",
    ],
}

PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def recommended_difficulty(average: float, weak_count: int) -> str:
    if average <= 0:
        return "basic"
    if weak_count >= 3 or average < 50:
        return "basic"
    if average < 75:
        return "intermediate"
    return "advanced"


def _fallback_payload(db: Session, stats: dict[str, Any], project: Project | None) -> dict[str, Any]:
    summary = stats["summary"]
    categories = stats["category_scores"]
    missing = stats["recurring_missing_concepts"]
    weak = [item for item in categories if item["verdict"] == "weak"]
    average = [item for item in categories if item["verdict"] == "average"]
    targets = (weak + average)[:6]
    recommendations: list[dict[str, Any]] = []

    for item in targets:
        category = item["category"]
        priority = "high" if item["average_score"] < 45 or item["attempts"] >= 2 else "medium"
        recommendations.append(
            {
                "topic": category,
                "recommendation": (
                    f"Your average in {category} is {item['average_score']}/100 across "
                    f"{item['attempts']} evaluated answer(s). "
                    + CATEGORY_ADVICE.get(category, "Revise this section of your report and practise explaining it aloud.")
                ),
                "priority": priority,
                "practice_questions": PRACTICE_QUESTIONS.get(
                    category,
                    [f"Explain the key ideas of {category} in your project."],
                )[:3],
                "source": "heuristic",
            }
        )

    for index, concept in enumerate(missing[:3]):
        if len(recommendations) >= 8:
            break
        recommendations.append(
            {
                "topic": concept["concept"],
                "recommendation": (
                    f"'{concept['concept']}' was missing from {concept['count']} evaluated answer(s). "
                    "Prepare a definition, the mechanism in your project, and one concrete example."
                ),
                "priority": "high" if index == 0 else "medium",
                "practice_questions": [
                    f"Explain '{concept['concept']}' and its role in your project.",
                    f"Where would '{concept['concept']}' fail or need adjustment?",
                ],
                "source": "heuristic",
            }
        )

    if not recommendations:
        if project:
            overview = build_overview(db, project)
            topics = (overview.get("topics") or [])[:4]
            for topic in topics:
                recommendations.append(
                    {
                        "topic": topic,
                        "recommendation": (
                            "No evaluated answers exist yet. Use this topic to start a baseline viva, "
                            "then recommendations will adapt to your real performance."
                        ),
                        "priority": "low",
                        "practice_questions": [f"Explain '{topic}' in the context of your project."],
                        "source": "heuristic",
                    }
                )
        if not recommendations:
            recommendations.append(
                {
                    "topic": "Baseline assessment",
                    "recommendation": (
                        "Complete at least one mock viva. Recommendations are generated from your "
                        "actual answers, not from generic templates."
                    ),
                    "priority": "medium",
                    "practice_questions": ["Start a 5-question basic viva to establish a baseline."],
                    "source": "heuristic",
                }
            )

    return {
        "recommendations": recommendations[:8],
        "recommended_difficulty": recommended_difficulty(
            summary["average_score"], len(weak)
        ),
        "engine": "heuristic",
        "context": {
            "average_score": summary["average_score"],
            "attempts": summary["total_questions"],
            "improvement": summary["improvement"],
        },
    }


def generate_recommendations(
    db: Session,
    user_id: int,
    project_id: int | None = None,
    *,
    use_llm: bool = True,
) -> dict[str, Any]:
    project = db.get(Project, project_id) if project_id else None
    stats = compute_analytics(db, user_id, project_id=project_id)

    payload: dict[str, Any] | None = None
    if use_llm and gemini.enabled and stats["summary"]["total_questions"] > 0:
        try:
            overviews = []
            if project:
                overview = build_overview(db, project)
                overviews.append(
                    {
                        "title": overview["title"],
                        "summary": overview["summary"],
                        "topics": overview["topics"],
                    }
                )
            raw = gemini.generate_json(
                recommendations_prompt(
                    stats={
                        "average_score": stats["summary"]["average_score"],
                        "attempts": stats["summary"]["total_questions"],
                        "improvement": stats["summary"]["improvement"],
                        "criteria": stats["criteria_scores"],
                    },
                    weak_topics=[
                        (item["category"], item["average_score"], item["attempts"])
                        for item in stats["category_scores"]
                        if item["verdict"] in {"weak", "average"}
                    ],
                    missing_concepts=[
                        item["concept"] for item in stats["recurring_missing_concepts"][:8]
                    ],
                    overviews=overviews,
                ),
                system=(
                    "You are an adaptive learning coach. Base every recommendation strictly on the "
                    "provided performance evidence. Return only JSON."
                ),
                temperature=0.45,
                max_output_tokens=2200,
            )
            parsed = LLMRecommendationList.model_validate(raw)
            recs = [
                {
                    "topic": item.topic.strip()[:120],
                    "recommendation": item.recommendation.strip(),
                    "priority": item.priority,
                    "practice_questions": item.practice_questions,
                    "source": "gemini",
                }
                for item in parsed.recommendations
                if item.topic.strip() and item.recommendation.strip()
            ][:8]
            if recs:
                payload = {
                    "recommendations": recs,
                    "recommended_difficulty": parsed.recommended_difficulty
                    if parsed.recommended_difficulty in {"basic", "intermediate", "advanced", "mixed"}
                    else "mixed",
                    "engine": "gemini",
                    "context": {
                        "average_score": stats["summary"]["average_score"],
                        "attempts": stats["summary"]["total_questions"],
                        "improvement": stats["summary"]["improvement"],
                    },
                }
        except (LLMUnavailableError, ValidationError, Exception) as exc:  # noqa: BLE001
            logger.warning("Gemini recommendations failed; using deterministic engine: %s", exc)

    if payload is None:
        payload = _fallback_payload(db, stats, project)

    # Replace open recommendations for this scope with the fresh analysis,
    # keeping completed items as a record of revision work.
    query = db.query(Recommendation).filter(
        Recommendation.user_id == user_id,
        Recommendation.status == "open",
    )
    if project_id:
        query = query.filter(Recommendation.project_id == project_id)
    else:
        query = query.filter(Recommendation.project_id.is_(None))
    for old in query.all():
        db.delete(old)
    db.flush()

    saved = []
    for item in payload["recommendations"]:
        rec = Recommendation(
            user_id=user_id,
            project_id=project_id,
            topic=item["topic"],
            recommendation=item["recommendation"],
            practice_questions=item.get("practice_questions") or [],
            priority=item["priority"],
            status="open",
            source=item.get("source", payload["engine"]),
        )
        db.add(rec)
        saved.append(rec)
    db.commit()
    for rec in saved:
        db.refresh(rec)

    return {
        "recommendations": [serialize_recommendation(rec) for rec in saved],
        "recommended_difficulty": payload["recommended_difficulty"],
        "engine": payload["engine"],
        "context": payload["context"],
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "recurring_missing_concepts": stats["recurring_missing_concepts"],
        "weak_topics": stats["weak_topics"],
    }


def serialize_recommendation(rec: Recommendation) -> dict[str, Any]:
    return {
        "id": rec.id,
        "project_id": rec.project_id,
        "topic": rec.topic,
        "recommendation": rec.recommendation,
        "practice_questions": rec.practice_questions or [],
        "priority": rec.priority,
        "status": rec.status,
        "source": rec.source,
        "created_at": rec.created_at.isoformat() if rec.created_at else None,
        "updated_at": rec.updated_at.isoformat() if rec.updated_at else None,
    }


def list_recommendations(
    db: Session, user_id: int, *, project_id: int | None = None, status: str | None = None
) -> list[Recommendation]:
    query = db.query(Recommendation).filter(Recommendation.user_id == user_id)
    if project_id:
        query = query.filter(Recommendation.project_id == project_id)
    if status:
        query = query.filter(Recommendation.status == status)
    return query.order_by(Recommendation.created_at.desc()).all()
