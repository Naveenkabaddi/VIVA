"""Document intelligence pipeline: validation, extraction, cleaning, chunking,
embedding generation, index persistence and project analysis."""
from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import Document, DocumentChunk, Project
from app.services import vector_store
from app.services.embeddings import embed_texts
from app.services.text_utils import (
    clean_document_text,
    chunk_pages,
    normalize_filename,
    sentence_split,
    truncate,
)

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".txt": "txt",
}
MAX_CHUNK_EMBED_BATCH = 64


class DocumentProcessingError(Exception):
    pass


def validate_upload(filename: str, size: int, content_head: bytes | None = None) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise DocumentProcessingError(
            f"Unsupported file type '{suffix or 'unknown'}'. Allowed: PDF, DOCX, TXT."
        )
    if size <= 0:
        raise DocumentProcessingError("The uploaded file is empty.")
    if size > settings.max_upload_bytes:
        raise DocumentProcessingError(
            f"File is larger than the {settings.max_upload_mb} MB limit."
        )
    if suffix == ".pdf" and content_head is not None and not content_head.startswith(b"%PDF"):
        raise DocumentProcessingError("The file does not look like a valid PDF.")
    if suffix == ".docx" and content_head is not None and not content_head.startswith(b"PK"):
        raise DocumentProcessingError("The file does not look like a valid DOCX document.")
    return ALLOWED_EXTENSIONS[suffix]


async def store_upload(upload: UploadFile, user_id: int, project_id: int) -> tuple[Path, int, str]:
    settings.ensure_directories()
    filename = normalize_filename(upload.filename or "document")
    file_type = ALLOWED_EXTENSIONS[Path(filename).suffix.lower()]
    target_dir = settings.upload_path / f"user_{user_id}" / f"project_{project_id}"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{uuid.uuid4().hex}_{filename}"

    size = 0
    head = b""
    with target.open("wb") as handle:
        while True:
            block = await upload.read(1024 * 1024)
            if not block:
                break
            if not head:
                head = block[:16]
            size += len(block)
            if size > settings.max_upload_bytes:
                handle.close()
                target.unlink(missing_ok=True)
                raise DocumentProcessingError(
                    f"File is larger than the {settings.max_upload_mb} MB limit."
                )
            handle.write(block)
    try:
        validate_upload(filename, size, head)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return target, size, file_type


def extract_pdf(path: Path) -> tuple[list[tuple[int, str]], int]:
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(path)
    except Exception as exc:
        raise DocumentProcessingError(f"Could not read PDF: {exc}") from exc
    pages: list[tuple[int, str]] = []
    try:
        for index, page in enumerate(doc):
            # get_text("text") preserves reading order reasonably well.
            pages.append((index + 1, page.get_text("text")))
        page_count = doc.page_count
    finally:
        doc.close()
    total_chars = sum(len(text.strip()) for _, text in pages)
    if total_chars == 0:
        raise DocumentProcessingError(
            "No selectable text found. The PDF appears to be scanned; please upload a "
            "text-based PDF/DOCX or run OCR before uploading."
        )
    if total_chars / max(page_count, 1) < 25.0:
        raise DocumentProcessingError(
            "Extracted text is too sparse to analyse (possibly a scanned document). "
            "Please upload a text-based version."
        )
    return pages, page_count


def extract_docx(path: Path) -> tuple[list[tuple[int, str]], int]:
    try:
        import docx
        from docx.table import Table
        from docx.text.paragraph import Paragraph
    except Exception as exc:  # pragma: no cover
        raise DocumentProcessingError("python-docx is not installed.") from exc
    try:
        document = docx.Document(str(path))
    except Exception as exc:
        raise DocumentProcessingError(f"Could not read DOCX: {exc}") from exc

    lines: list[str] = []
    body = document.element.body
    for child in body.iterchildren():
        tag = child.tag.split("}")[-1]
        if tag == "p":
            paragraph = Paragraph(child, document)
            text = paragraph.text.strip()
            if not text:
                continue
            style = (paragraph.style.name or "").lower() if paragraph.style else ""
            if style.startswith("heading") or style == "title":
                lines.append("")
                lines.append(f"## {text}")
                lines.append("")
            else:
                lines.append(text)
        elif tag == "tbl":
            table = Table(child, document)
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if cells:
                    lines.append(" | ".join(cells))
    pages = [(1, "\n".join(lines))]
    if not lines:
        raise DocumentProcessingError("The DOCX document contains no readable text.")
    return pages, 1


def extract_txt(path: Path) -> tuple[list[tuple[int, str]], int]:
    raw = path.read_bytes()
    text = None
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise DocumentProcessingError("Could not decode the TXT file.")
    if not text.strip():
        raise DocumentProcessingError("The TXT file is empty.")
    # Respect explicit page markers when present.
    if "[[PAGE" in text:
        pages: list[tuple[int, str]] = []
        parts = re.split(r"\[\[PAGE\s*(\d+)\]\]", text)
        for i in range(1, len(parts), 2):
            pages.append((int(parts[i]), parts[i + 1]))
        return pages or [(1, text)], len(pages) or 1
    return [(1, text)], 1


def extract_document(path: Path, file_type: str) -> tuple[list[tuple[int, str]], int]:
    if file_type == "pdf":
        return extract_pdf(path)
    if file_type == "docx":
        return extract_docx(path)
    if file_type == "txt":
        return extract_txt(path)
    raise DocumentProcessingError(f"Unsupported file type: {file_type}")


def rebuild_project_index(db: Session, project_id: int) -> int:
    """Rebuild the persisted vector index from ready chunks in the database."""
    rows = db.execute(
        select(DocumentChunk)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(Document.project_id == project_id, Document.processing_status == "ready")
        .order_by(DocumentChunk.id)
    ).scalars().all()
    rows = [row for row in rows if row.embedding]
    if not rows:
        vector_store.delete_index(project_id)
        return 0
    filename_map = {
        doc.id: doc.filename
        for doc in db.execute(select(Document).where(Document.project_id == project_id)).scalars()
    }
    records = [
        {
            "chunk_id": row.id,
            "document_id": row.document_id,
            "filename": filename_map.get(row.document_id, "document"),
            "section": row.section,
            "page_number": row.page_number,
        }
        for row in rows
    ]
    import numpy as np

    embeddings = np.asarray([row.embedding for row in rows], dtype="float32")
    return vector_store.save_index(project_id, records, embeddings)


def process_document(db: Session, document_id: int) -> Document | None:
    """Full synchronous processing step; called from a background task."""
    document = db.get(Document, document_id)
    if not document:
        return None
    project = db.get(Project, document.project_id)
    try:
        document.processing_status = "processing"
        document.error_message = None
        db.commit()

        path = Path(document.stored_path)
        if not path.exists():
            raise DocumentProcessingError("Stored file no longer exists on disk.")
        pages, page_count = extract_document(path, document.file_type)
        chunks = chunk_pages(pages)
        if not chunks:
            raise DocumentProcessingError("No meaningful text chunks could be produced.")
        if len(chunks) > 4000:
            chunks = chunks[:4000]

        db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete()
        db.commit()

        texts = [chunk.content for chunk in chunks]
        embeddings = embed_texts(texts, batch_size=MAX_CHUNK_EMBED_BATCH)
        for chunk, vector in zip(chunks, embeddings):
            db.add(
                DocumentChunk(
                    document_id=document.id,
                    project_id=document.project_id,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    section=chunk.section,
                    page_number=chunk.page_number,
                    token_count=len(chunk.content.split()),
                    embedding=[round(float(value), 6) for value in vector],
                )
            )
        document.page_count = page_count
        document.word_count = sum(len(t.split()) for _, t in pages)
        document.chunk_count = len(chunks)
        document.processing_status = "ready"
        document.processed_at = datetime.now(timezone.utc)
        db.commit()

        rebuild_project_index(db, document.project_id)
        if project:
            other = db.execute(
                select(Document).where(
                    Document.project_id == project.id,
                    Document.id != document.id,
                    Document.processing_status == "failed",
                )
            ).scalars().all()
            project.status = "attention" if other else "ready"
            project.updated_at = datetime.now(timezone.utc)
            db.commit()
        logger.info("Processed document %s into %s chunks", document.id, len(chunks))
    except DocumentProcessingError as exc:
        _mark_failed(db, document, project, str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Unexpected document processing failure")
        _mark_failed(db, document, project, f"Processing failed: {exc}")
    return document


def _mark_failed(db: Session, document: Document, project: Project | None, message: str) -> None:
    document.processing_status = "failed"
    document.error_message = truncate(message, 500)
    if project:
        project.status = "attention"
    db.commit()


def delete_document(db: Session, document: Document) -> None:
    path = Path(document.stored_path)
    if path.exists():
        try:
            path.unlink()
        except OSError:  # pragma: no cover
            logger.warning("Could not delete file %s", path)
    project_id = document.project_id
    db.delete(document)
    db.commit()
    rebuild_project_index(db, project_id)
    remaining = db.execute(
        select(Document).where(Document.project_id == project_id)
    ).scalars().all()
    project = db.get(Project, project_id)
    if project:
        if any(doc.processing_status == "ready" for doc in remaining):
            project.status = "ready"
        elif remaining:
            project.status = "attention"
        else:
            project.status = "draft"


def delete_project_files(project: Project) -> None:
    settings.ensure_directories()
    folder = settings.upload_path / f"user_{project.user_id}" / f"project_{project.id}"
    if folder.exists():
        for child in folder.rglob("*"):
            if child.is_file():
                child.unlink(missing_ok=True)
        for child in sorted(folder.rglob("*"), reverse=True):
            if child.is_dir():
                try:
                    child.rmdir()
                except OSError:
                    pass
        try:
            folder.rmdir()
        except OSError:
            pass
    vector_store.delete_index(project.id)


def document_content(db: Session, document: Document) -> dict:
    chunks = db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document.id)
        .order_by(DocumentChunk.chunk_index)
    ).scalars().all()
    sections: dict[str, int] = {}
    for chunk in chunks:
        sections[chunk.section] = sections.get(chunk.section, 0) + 1
    return {
        "id": document.id,
        "filename": document.filename,
        "processing_status": document.processing_status,
        "page_count": document.page_count,
        "word_count": document.word_count,
        "chunk_count": document.chunk_count,
        "sections": [{"name": name, "chunks": count} for name, count in sections.items()],
        "chunks": [
            {
                "id": chunk.id,
                "section": chunk.section,
                "page_number": chunk.page_number,
                "content": chunk.content,
            }
            for chunk in chunks
        ],
    }
