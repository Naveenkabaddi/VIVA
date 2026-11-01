"""Document upload, processing status, content and deletion endpoints."""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, Form, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, DbSession, get_owned_project
from app.core.errors import AppError
from app.db.models import Document, Project
from app.db.session import SessionLocal
from app.schemas.project import DocumentOut
from app.services.document_service import (
    ALLOWED_EXTENSIONS,
    DocumentProcessingError,
    delete_document,
    document_content,
    process_document,
    store_upload,
)

router = APIRouter(prefix="/documents", tags=["documents"])
logger = logging.getLogger(__name__)


def _owned_document(db: Session, user_id: int, document_id: int) -> Document:
    document = (
        db.query(Document)
        .join(Project, Project.id == Document.project_id)
        .filter(Document.id == document_id, Project.user_id == user_id)
        .first()
    )
    if not document:
        raise AppError("Document not found.", 404, "document_not_found")
    return document


def _process_in_background(document_id: int) -> None:
    db = SessionLocal()
    try:
        process_document(db, document_id)
    except Exception:  # pragma: no cover - process_document handles errors
        logger.exception("Background document processing crashed")
    finally:
        db.close()


def _document_out(document: Document) -> DocumentOut:
    return DocumentOut.model_validate(document)


@router.post("/upload", response_model=DocumentOut, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background: BackgroundTasks,
    user: CurrentUser,
    db: DbSession,
    project_id: int = Form(...),
    file: UploadFile = File(...),
) -> DocumentOut:
    project = get_owned_project(db, user.id, project_id)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise AppError("Only PDF, DOCX and TXT files are supported.", 422, "unsupported_file")
    try:
        stored_path, size, file_type = await store_upload(file, user.id, project.id)
    except DocumentProcessingError as exc:
        raise AppError(str(exc), 422, "invalid_document") from exc

    document = Document(
        project_id=project.id,
        filename=Path(file.filename or stored_path.name).name[:255],
        stored_path=str(stored_path),
        file_type=file_type,
        size_bytes=size,
        processing_status="pending",
    )
    db.add(document)
    project.status = "processing"
    db.commit()
    db.refresh(document)
    background.add_task(_process_in_background, document.id)
    logger.info("Queued document %s for processing (project=%s)", document.id, project.id)
    return _document_out(document)


@router.get("", response_model=list[DocumentOut])
def list_documents(
    user: CurrentUser,
    db: DbSession,
    project_id: int | None = Query(default=None),
) -> list[DocumentOut]:
    query = (
        db.query(Document)
        .join(Project, Project.id == Document.project_id)
        .filter(Project.user_id == user.id)
    )
    if project_id:
        get_owned_project(db, user.id, project_id)
        query = query.filter(Document.project_id == project_id)
    documents = query.order_by(Document.created_at.desc()).all()
    return [_document_out(document) for document in documents]


@router.get("/{document_id}/status")
def document_status(document_id: int, user: CurrentUser, db: DbSession) -> dict:
    document = _owned_document(db, user.id, document_id)
    messages = {
        "pending": "Queued for processing.",
        "processing": "Extracting text, chunking and generating embeddings.",
        "ready": "Document processed and indexed.",
        "failed": document.error_message or "Processing failed.",
    }
    return {
        "id": document.id,
        "project_id": document.project_id,
        "processing_status": document.processing_status,
        "message": messages.get(document.processing_status, "Unknown status"),
        "chunk_count": document.chunk_count,
        "page_count": document.page_count,
        "word_count": document.word_count,
        "error_message": document.error_message,
        "processed_at": document.processed_at.isoformat() if document.processed_at else None,
    }


@router.get("/{document_id}/content")
def get_document_content(document_id: int, user: CurrentUser, db: DbSession) -> dict:
    document = _owned_document(db, user.id, document_id)
    if document.processing_status != "ready":
        raise AppError(
            "Document is not ready. Check its processing status first.",
            409,
            "document_not_ready",
        )
    return document_content(db, document)


@router.post("/{document_id}/reprocess", response_model=DocumentOut, status_code=202)
def reprocess_document(
    document_id: int, background: BackgroundTasks, user: CurrentUser, db: DbSession
) -> DocumentOut:
    document = _owned_document(db, user.id, document_id)
    if not Path(document.stored_path).exists():
        raise AppError("The stored file is missing; upload it again.", 409, "file_missing")
    document.processing_status = "pending"
    document.error_message = None
    document.chunk_count = 0
    document.processed_at = None
    db.commit()
    db.refresh(document)
    background.add_task(_process_in_background, document.id)
    return _document_out(document)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def remove_document(document_id: int, user: CurrentUser, db: DbSession) -> Response:
    document = _owned_document(db, user.id, document_id)
    delete_document(db, document)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
