"""Mock viva, evaluation, voice and recommendation schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class StartVivaRequest(BaseModel):
    project_id: int
    difficulty: str = Field(default="mixed", pattern="^(basic|intermediate|advanced|mixed)$")
    duration_minutes: int = Field(default=20, ge=5, le=120)
    question_count: int = Field(default=8, ge=3, le=30)
    mode: str = Field(default="text", pattern="^(text|voice)$")
    categories: list[str] = Field(default_factory=list)


class AnswerRequest(BaseModel):
    answer_text: str = Field(min_length=1, max_length=12000)
    input_type: str = Field(default="text", pattern="^(text|voice)$")


class EvaluateRequest(BaseModel):
    project_id: int
    question: str = Field(min_length=5, max_length=2000)
    answer: str = Field(min_length=0, max_length=12000)
    expected_answer: str = Field(default="", max_length=5000)
    category: str = Field(default="Technical Concepts", max_length=80)
    difficulty: str = Field(default="intermediate", pattern="^(basic|intermediate|advanced)$")


class RecommendationUpdate(BaseModel):
    status: Literal["open", "done"]


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    lang: str = Field(default="en", max_length=12)
    slow: bool = False


class EvaluationOut(BaseModel):
    id: int | None = None
    answer_id: int | None = None
    technical_accuracy: float
    relevance: float
    completeness: float
    conceptual_understanding: float
    clarity: float
    total_score: float
    strengths: list[str] = Field(default_factory=list)
    missing_concepts: list[str] = Field(default_factory=list)
    mistakes: list[str] = Field(default_factory=list)
    corrected_answer: str = ""
    reference_answer: str = ""
    improvement_suggestions: list[str] = Field(default_factory=list)
    source_references: list[dict[str, Any]] = Field(default_factory=list)
    feedback: str = ""
    sufficient_context: bool = True
    engine: str = "heuristic"
    created_at: datetime | None = None


class SessionOut(BaseModel):
    id: int
    project_id: int
    project_title: str | None = None
    difficulty: str
    duration_minutes: int
    question_count: int
    mode: str
    status: str
    started_at: str | None = None
    completed_at: str | None = None
    overall_score: float | None = None
    answered_count: int = 0
    total_questions: int = 0
    progress: float = 0
    elapsed_minutes: float = 0
    current_question: dict[str, Any] | None = None
    turns: list[dict[str, Any]] | None = None


class StartVivaResponse(BaseModel):
    session: SessionOut
    question: dict[str, Any] | None = None
    engine: str = "heuristic"


class AnswerResponse(BaseModel):
    completed: bool
    evaluation: EvaluationOut | None = None
    evaluation_meta: dict[str, Any] | None = None
    followup_generated: bool = False
    next_question: dict[str, Any] | None = None
    session: SessionOut
    report: dict[str, Any] | None = None


class HistoryOut(BaseModel):
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int


class RecommendationOut(BaseModel):
    id: int
    project_id: int | None = None
    topic: str
    recommendation: str
    practice_questions: list[str] = Field(default_factory=list)
    priority: str
    status: str
    source: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class RecommendationListOut(BaseModel):
    items: list[RecommendationOut]
    total: int


class GenerateRecommendationRequest(BaseModel):
    project_id: int | None = None
