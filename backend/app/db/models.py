"""SQLAlchemy ORM models for the AI Viva Preparation Platform."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(30), default="student", nullable=False)
    theme: Mapped[str] = mapped_column(String(10), default="light", nullable=False)
    default_difficulty: Mapped[str] = mapped_column(String(20), default="mixed", nullable=False)
    tts_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    projects: Mapped[list["Project"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    sessions: Mapped[list["VivaSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )
    recommendations: Mapped[list["Recommendation"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    domain: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    analysis: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="projects")
    documents: Mapped[list["Document"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", passive_deletes=True
    )
    sessions: Mapped[list["VivaSession"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (Index("ix_projects_user_status", "user_id", "status"),)


class Document(Base, TimestampMixin):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(512), nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processing_status: Mapped[str] = mapped_column(String(30), default="pending", nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    word_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped[Project] = relationship(back_populates="documents")
    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", passive_deletes=True
    )

    __table_args__ = (Index("ix_documents_project_status", "project_id", "processing_status"),)


class DocumentChunk(Base, TimestampMixin):
    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    section: Mapped[str] = mapped_column(String(255), default="General", nullable=False)
    page_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    embedding: Mapped[Optional[list[float]]] = mapped_column(JSON, nullable=True)

    document: Mapped[Document] = relationship(back_populates="chunks")

    __table_args__ = (Index("ix_chunks_project_doc", "project_id", "document_id"),)


class VivaSession(Base, TimestampMixin):
    __tablename__ = "viva_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    difficulty: Mapped[str] = mapped_column(String(20), default="mixed", nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    mode: Mapped[str] = mapped_column(String(20), default="text", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    paused_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    overall_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    current_sequence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    user: Mapped[User] = relationship(back_populates="sessions")
    project: Mapped[Project] = relationship(back_populates="sessions")
    questions: Mapped[list["Question"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", passive_deletes=True,
        order_by="Question.sequence",
    )
    answers: Mapped[list["Answer"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", passive_deletes=True
    )
    report: Mapped[Optional["SessionReport"]] = relationship(
        back_populates="session", cascade="all, delete-orphan", passive_deletes=True, uselist=False
    )

    __table_args__ = (Index("ix_sessions_user_status", "user_id", "status"),)


class Question(Base, TimestampMixin):
    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    session_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("viva_sessions.id", ondelete="CASCADE"), index=True, nullable=True
    )
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(20), default="intermediate", nullable=False)
    expected_answer: Mapped[str] = mapped_column(Text, default="", nullable=False)
    source_reference: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    is_followup: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sequence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    engine: Mapped[str] = mapped_column(String(20), default="heuristic", nullable=False)

    session: Mapped[Optional[VivaSession]] = relationship(back_populates="questions")
    answers: Mapped[list["Answer"]] = relationship(
        back_populates="question", cascade="all, delete-orphan", passive_deletes=True
    )


class Answer(Base, TimestampMixin):
    __tablename__ = "answers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("viva_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    answer_text: Mapped[str] = mapped_column(Text, nullable=False)
    input_type: Mapped[str] = mapped_column(String(20), default="text", nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    session: Mapped[VivaSession] = relationship(back_populates="answers")
    question: Mapped[Question] = relationship(back_populates="answers")
    evaluation: Mapped[Optional["Evaluation"]] = relationship(
        back_populates="answer", cascade="all, delete-orphan", passive_deletes=True, uselist=False
    )

    __table_args__ = (UniqueConstraint("question_id", name="uq_answers_question"),)


class Evaluation(Base, TimestampMixin):
    __tablename__ = "evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    answer_id: Mapped[int] = mapped_column(
        ForeignKey("answers.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    session_id: Mapped[int] = mapped_column(
        ForeignKey("viva_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    accuracy_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    relevance_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    completeness_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    understanding_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    clarity_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    total_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    strengths: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    missing_concepts: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    mistakes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    corrected_answer: Mapped[str] = mapped_column(Text, default="", nullable=False)
    reference_answer: Mapped[str] = mapped_column(Text, default="", nullable=False)
    improvement_suggestions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    source_references: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    feedback: Mapped[str] = mapped_column(Text, default="", nullable=False)
    sufficient_context: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    engine: Mapped[str] = mapped_column(String(20), default="heuristic", nullable=False)

    answer: Mapped[Answer] = relationship(back_populates="evaluation")


class Recommendation(Base, TimestampMixin):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=True
    )
    topic: Mapped[str] = mapped_column(String(120), nullable=False)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False)
    practice_questions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="heuristic", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    user: Mapped[User] = relationship(back_populates="recommendations")


class SessionReport(Base, TimestampMixin):
    __tablename__ = "session_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("viva_sessions.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    summary: Mapped[str] = mapped_column(Text, default="", nullable=False)
    strengths: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    weaknesses: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    improvement_plan: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    category_breakdown: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    overall_score: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    engine: Mapped[str] = mapped_column(String(20), default="heuristic", nullable=False)

    session: Mapped[VivaSession] = relationship(back_populates="report")
