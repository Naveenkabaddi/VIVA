"""Project, document and AI request/response schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ProjectCreate(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    description: str = Field(default="", max_length=4000)
    domain: str = Field(default="", max_length=120)


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    domain: str | None = Field(default=None, max_length=120)


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    filename: str
    file_type: str
    size_bytes: int
    processing_status: str
    error_message: str | None = None
    page_count: int
    word_count: int
    chunk_count: int
    created_at: datetime
    processed_at: datetime | None = None


class ProjectOut(BaseModel):
    id: int
    title: str
    description: str
    domain: str
    status: str
    created_at: datetime
    updated_at: datetime
    document_count: int = 0
    ready_documents: int = 0
    session_count: int = 0
    latest_score: float | None = None
    documents: list[DocumentOut] = Field(default_factory=list)


class ProjectDetailOut(ProjectOut):
    overview: dict[str, Any] = Field(default_factory=dict)
    recent_sessions: list[dict[str, Any]] = Field(default_factory=list)


class GenerateQuestionsRequest(BaseModel):
    project_id: int
    difficulty: str = Field(default="mixed", pattern="^(basic|intermediate|advanced|mixed)$")
    count: int = Field(default=6, ge=1, le=20)
    categories: list[str] = Field(default_factory=list)


class AnalyzeProjectRequest(BaseModel):
    project_id: int


class GenerateQuestionsResponse(BaseModel):
    project_id: int
    engine: str
    questions: list[dict[str, Any]]


class GenerateFollowupRequest(BaseModel):
    project_id: int
    question: str = Field(min_length=5, max_length=2000)
    answer: str = Field(min_length=1, max_length=8000)
    score: float = Field(default=50, ge=0, le=100)
    category: str = Field(default="Technical Concepts", max_length=80)
    difficulty: str = Field(default="intermediate", pattern="^(basic|intermediate|advanced)$")
    missing_concepts: list[str] = Field(default_factory=list)


class AnalyzeProjectResponse(BaseModel):
    project_id: int
    engine: str
    overview: dict[str, Any]
