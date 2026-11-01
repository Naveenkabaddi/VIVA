"""Pydantic contracts for LLM JSON output. Never trust raw model JSON."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


def _clamp(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(100.0, number))


class LLMQuestion(BaseModel):
    category: str = "Technical Concepts"
    question: str = Field(min_length=8)
    difficulty: str = "intermediate"
    expected_answer: str = ""
    source_chunk_ids: list[int] = Field(default_factory=list)
    source_reference: dict[str, Any] = Field(default_factory=dict)

    @field_validator("source_chunk_ids", mode="before")
    @classmethod
    def _ids(cls, value: Any) -> list[int]:
        if not isinstance(value, list):
            return []
        result = []
        for item in value[:8]:
            try:
                result.append(int(item))
            except (TypeError, ValueError):
                continue
        return result

    @field_validator("difficulty")
    @classmethod
    def _difficulty(cls, value: str) -> str:
        value = (value or "").lower().strip()
        return value if value in {"basic", "intermediate", "advanced"} else "intermediate"


class LLMQuestionList(BaseModel):
    questions: list[LLMQuestion] = Field(default_factory=list)


class LLMProjectAnalysis(BaseModel):
    summary: str = ""
    domain: str = ""
    technologies: list[str] = Field(default_factory=list)
    topics: list[str] = Field(default_factory=list)
    objectives: list[str] = Field(default_factory=list)
    key_components: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)


class LLMEvaluation(BaseModel):
    technical_accuracy: float = 0
    relevance: float = 0
    completeness: float = 0
    conceptual_understanding: float = 0
    clarity: float = 0
    total_score: float = 0
    strengths: list[str] = Field(default_factory=list)
    missing_concepts: list[str] = Field(default_factory=list)
    mistakes: list[str] = Field(default_factory=list)
    corrected_answer: str = ""
    improvement_suggestions: list[str] = Field(default_factory=list)
    source_references: list[dict[str, Any]] = Field(default_factory=list)
    feedback: str = ""
    sufficient_context: bool = True

    @field_validator(
        "technical_accuracy", "relevance", "completeness",
        "conceptual_understanding", "clarity", "total_score", mode="before",
    )
    @classmethod
    def _scores(cls, value: Any) -> float:
        return _clamp(value)

    @field_validator("strengths", "missing_concepts", "mistakes", "improvement_suggestions", mode="before")
    @classmethod
    def _strings(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip()[:400] for item in value[:10] if str(item).strip()]

    @field_validator("corrected_answer", "feedback", mode="before")
    @classmethod
    def _text(cls, value: Any) -> str:
        return str(value or "").strip()[:5000]


class LLMFollowUp(BaseModel):
    ask_followup: bool = True
    question: str = ""
    category: str = ""
    difficulty: str = "intermediate"
    reason: str = ""


class LLMReferenceAnswer(BaseModel):
    reference_answer: str = ""
    key_points: list[str] = Field(default_factory=list)
    source_chunk_ids: list[int] = Field(default_factory=list)
    missing_information: str = ""


class LLMReport(BaseModel):
    summary: str = ""
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    improvement_plan: list[str] = Field(default_factory=list)
    category_breakdown: list[dict[str, Any]] = Field(default_factory=list)
    readiness: str = "needs_practice"
    examiner_remarks: str = ""

    @field_validator("strengths", "weaknesses", "improvement_plan", mode="before")
    @classmethod
    def _lists(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip()[:500] for item in value[:12] if str(item).strip()]


class LLMRecommendation(BaseModel):
    topic: str = ""
    recommendation: str = ""
    priority: Literal["high", "medium", "low"] = "medium"
    practice_questions: list[str] = Field(default_factory=list)

    @field_validator("priority", mode="before")
    @classmethod
    def _priority(cls, value: Any) -> str:
        value = str(value or "medium").lower()
        return value if value in {"high", "medium", "low"} else "medium"

    @field_validator("practice_questions", mode="before")
    @classmethod
    def _questions(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip()[:500] for item in value[:5] if str(item).strip()]


class LLMRecommendationList(BaseModel):
    recommendations: list[LLMRecommendation] = Field(default_factory=list)
    study_plan: list[str] = Field(default_factory=list)
    recommended_difficulty: str = "mixed"
