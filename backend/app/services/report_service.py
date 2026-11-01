"""Session report generation from actual stored evaluations."""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.db.models import Answer, Evaluation, Project, Question, SessionReport, VivaSession
from app.schemas.llm import LLMReport
from app.services.llm import LLMUnavailableError, gemini
from app.services.prompts import performance_analysis_prompt
from app.services.rag import cached_overview

logger = logging.getLogger(__name__)

VERDICT_STRONG = 75.0
VERDICT_WEAK = 50.0


def session_turns(db: Session, session: VivaSession) -> list[dict[str, Any]]:
    rows = (
        db.query(Question, Answer, Evaluation)
        .outerjoin(Answer, Answer.question_id == Question.id)
        .outerjoin(Evaluation, Evaluation.answer_id == Answer.id)
        .filter(Question.session_id == session.id)
        .order_by(Question.sequence, Question.id)
        .all()
    )
    turns = []
    for question, answer, evaluation in rows:
        turns.append(
            {
                "question_id": question.id,
                "question": question.question_text,
                "category": question.category,
                "difficulty": question.difficulty,
                "is_followup": question.is_followup,
                "source_reference": question.source_reference,
                "expected_answer": question.expected_answer,
                "answer_id": answer.id if answer else None,
                "answer_text": answer.answer_text if answer else None,
                "input_type": answer.input_type if answer else None,
                "submitted_at": answer.submitted_at.isoformat() if answer and answer.submitted_at else None,
                "evaluation": _evaluation_dict(evaluation) if evaluation else None,
                "score": evaluation.total_score if evaluation else None,
            }
        )
    return turns


def _evaluation_dict(evaluation: Evaluation) -> dict[str, Any]:
    return {
        "id": evaluation.id,
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
        "engine": evaluation.engine,
    }


def overall_report(db: Session, session: VivaSession) -> SessionReport | None:
    return (
        db.query(SessionReport).filter(SessionReport.session_id == session.id).first()
    )


def category_stats(turns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for turn in turns:
        if turn.get("score") is not None:
            buckets[turn["category"]].append(float(turn["score"]))
    stats = []
    for category, scores in buckets.items():
        average = round(sum(scores) / len(scores), 1)
        verdict = "strong" if average >= VERDICT_STRONG else ("weak" if average < VERDICT_WEAK else "average")
        stats.append(
            {"category": category, "average_score": average, "attempts": len(scores), "verdict": verdict}
        )
    return sorted(stats, key=lambda item: item["average_score"], reverse=True)


def fallback_report(turns: list[dict[str, Any]], session: VivaSession) -> dict[str, Any]:
    answered = [turn for turn in turns if turn.get("score") is not None]
    scores = [float(turn["score"]) for turn in answered]
    average = round(sum(scores) / len(scores), 1) if scores else 0.0
    stats = category_stats(turns)
    strong = [item["category"] for item in stats if item["verdict"] == "strong"][:5]
    weak = [item["category"] for item in stats if item["verdict"] == "weak"][:5]
    missing: list[str] = []
    for turn in answered:
        for concept in (turn.get("evaluation") or {}).get("missing_concepts", []):
            if concept not in missing:
                missing.append(concept)

    if not answered:
        summary = (
            "This viva session ended without any evaluated answers, so no performance judgement "
            "can be made. Start a new session and attempt at least three questions for a meaningful report."
        )
    elif average >= 80:
        summary = (
            f"You scored an average of {average}/100 across {len(answered)} evaluated answers. "
            "The performance is strong: answers were grounded in the project and demonstrated good "
            f"technical understanding. {('Strong areas: ' + ', '.join(strong) + '.') if strong else ''} "
            "Focus next on quantifying results and defending design trade-offs under pressure."
        )
    elif average >= 60:
        summary = (
            f"You scored an average of {average}/100 across {len(answered)} evaluated answers. "
            "This is a solid foundation, but depth and justification were inconsistent. "
            f"{('Strong areas: ' + ', '.join(strong) + '. ') if strong else ''}"
            f"{('Needs revision: ' + ', '.join(weak) + '. ') if weak else ''}"
            "Revise the missing concepts below and practise concise, evidence-based answers."
        )
    else:
        summary = (
            f"You scored an average of {average}/100 across {len(answered)} evaluated answers. "
            "The viva exposed significant gaps in project knowledge or explanation structure. "
            "This is normal at the start: revisit the report sections, prepare one-minute explanations "
            "for every module, and retake this viva at basic difficulty."
        )

    improvement_plan = []
    for category in weak[:3]:
        improvement_plan.append(
            f"Revise the '{category}' section of your report and prepare a 60-second explanation with one concrete example."
        )
    for concept in missing[:3]:
        improvement_plan.append(
            f"Study '{concept}', then explain its role in your project aloud without notes."
        )
    if not improvement_plan:
        improvement_plan = [
            "Rehearse a 2-minute project walkthrough covering problem, architecture and results.",
            "For each major design choice, prepare the alternative you rejected and the reason.",
            "Add quantified evidence (accuracy, latency, test coverage) to defend your claims.",
        ]

    readiness = "ready" if average >= 78 else ("nearly_ready" if average >= 58 else "needs_practice")
    return {
        "summary": summary,
        "strengths": strong or (["Clear effort to engage with the examiner."] if answered else []),
        "weaknesses": weak or ([] if answered else ["No answers were evaluated in this session."]),
        "improvement_plan": improvement_plan[:7],
        "category_breakdown": [
            {
                "category": item["category"],
                "average_score": item["average_score"],
                "verdict": item["verdict"],
            }
            for item in stats
        ],
        "readiness": readiness,
        "examiner_remarks": (
            "The examiner expects you to connect every claim to evidence in your report. "
            "Structure answers as definition, mechanism, project example, and limitation."
        ),
        "engine": "heuristic",
    }


def generate_report(db: Session, session: VivaSession) -> SessionReport:
    existing = overall_report(db, session)
    turns = session_turns(db, session)
    project = db.get(Project, session.project_id)
    avg_scores = [turn["score"] for turn in turns if turn.get("score") is not None]
    overall = round(sum(avg_scores) / len(avg_scores), 1) if avg_scores else 0.0

    payload: dict[str, Any] | None = None
    if gemini.enabled and turns and project:
        try:
            overview = cached_overview(db, project)
            raw = gemini.generate_json(
                performance_analysis_prompt(
                    overview,
                    session_data={
                        "difficulty": session.difficulty,
                        "question_count": session.question_count,
                        "mode": session.mode,
                        "overall_score": overall,
                    },
                    turns=turns,
                ),
                system=(
                    "You are a senior viva examiner writing an evidence-based session report. "
                    "Return only JSON and never invent evidence."
                ),
                temperature=0.35,
                max_output_tokens=2200,
            )
            parsed = LLMReport.model_validate(raw)
            if parsed.summary.strip():
                payload = {
                    "summary": parsed.summary,
                    "strengths": parsed.strengths[:6],
                    "weaknesses": parsed.weaknesses[:6],
                    "improvement_plan": parsed.improvement_plan[:8],
                    "category_breakdown": category_stats(turns),
                    "readiness": parsed.readiness,
                    "examiner_remarks": parsed.examiner_remarks,
                    "engine": "gemini",
                }
        except (LLMUnavailableError, ValidationError, Exception) as exc:  # noqa: BLE001
            logger.warning("Gemini report generation failed; using offline report: %s", exc)

    if payload is None:
        payload = fallback_report(turns, session)

    if existing:
        report = existing
        report.summary = payload["summary"]
        report.strengths = payload["strengths"]
        report.weaknesses = payload["weaknesses"]
        report.improvement_plan = payload["improvement_plan"]
        report.category_breakdown = payload["category_breakdown"]
        report.overall_score = overall
        report.engine = payload.get("engine", "heuristic")
    else:
        report = SessionReport(
            session_id=session.id,
            summary=payload["summary"],
            strengths=payload["strengths"],
            weaknesses=payload["weaknesses"],
            improvement_plan=payload["improvement_plan"],
            category_breakdown=payload["category_breakdown"],
            overall_score=overall,
            engine=payload.get("engine", "heuristic"),
        )
        db.add(report)
    db.commit()
    db.refresh(report)
    return report


def report_dict(report: SessionReport, turns: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    data = {
        "id": report.id,
        "session_id": report.session_id,
        "summary": report.summary,
        "strengths": report.strengths,
        "weaknesses": report.weaknesses,
        "improvement_plan": report.improvement_plan,
        "category_breakdown": report.category_breakdown,
        "overall_score": report.overall_score,
        "engine": report.engine,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }
    if turns is not None:
        data["turns"] = turns
    return data
