"""Project analysis and retrieval-augmented generation (RAG) engine."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Document, DocumentChunk, Project
from app.services import vector_store
from app.services.document_service import rebuild_project_index
from app.services.embeddings import embed_text, backend_info
from app.services.text_utils import (
    best_sentences,
    canonical_section,
    extract_key_concepts,
    keyword_phrases,
    normalize_concepts,
    sentence_split,
    truncate,
)

logger = logging.getLogger(__name__)

TECH_CANONICAL = {
    "python", "fastapi", "django", "flask", "react", "nodejs", "typescript", "javascript",
    "postgresql", "mysql", "sqlite", "mongodb", "sql", "nosql", "docker", "kubernetes",
    "aws", "azure", "gcp", "machine_learning", "deep_learning", "nlp", "computer_vision",
    "tensorflow", "pytorch", "scikit", "pandas", "numpy", "opencv", "llm", "rag", "gemini",
    "openai", "whisper", "faiss", "chromadb", "rest_api", "jwt", "git", "github", "tailwind",
    "cnn", "rnn", "lstm", "transformer", "random_forest", "decision_tree", "svm", "knn",
    "logistic_regression", "linear_regression", "ocr", "redis", "celery", "streamlit",
}

TECH_LABELS = {
    "machine_learning": "Machine Learning", "deep_learning": "Deep Learning",
    "nlp": "NLP", "computer_vision": "Computer Vision", "postgresql": "PostgreSQL",
    "mysql": "MySQL", "sqlite": "SQLite", "mongodb": "MongoDB", "nodejs": "Node.js",
    "typescript": "TypeScript", "javascript": "JavaScript", "rest_api": "REST API",
    "jwt": "JWT", "llm": "LLM", "rag": "RAG", "cnn": "CNN", "rnn": "RNN", "lstm": "LSTM",
    "svm": "SVM", "knn": "KNN", "random_forest": "Random Forest",
    "decision_tree": "Decision Tree", "logistic_regression": "Logistic Regression",
    "linear_regression": "Linear Regression", "ocr": "OCR", "faiss": "FAISS",
    "chromadb": "ChromaDB", "openai": "OpenAI", "gemini": "Gemini", "whisper": "Whisper",
    "tensorflow": "TensorFlow", "pytorch": "PyTorch", "scikit": "scikit-learn",
    "opencv": "OpenCV", "aws": "AWS", "gcp": "GCP", "api": "API", "dbms": "DBMS",
}


def build_overview(db: Session, project: Project, max_chunks: int = 80) -> dict[str, Any]:
    docs = db.execute(
        select(Document).where(Document.project_id == project.id).order_by(Document.id)
    ).scalars().all()
    ready = [doc for doc in docs if doc.processing_status == "ready"]
    chunks = db.execute(
        select(DocumentChunk)
        .where(DocumentChunk.project_id == project.id)
        .order_by(DocumentChunk.id)
        .limit(max_chunks)
    ).scalars().all()

    sections: list[str] = []
    for chunk in chunks:
        if chunk.section and chunk.section != "General" and chunk.section not in sections:
            sections.append(chunk.section)

    all_text = "\n".join(chunk.content for chunk in chunks)
    concepts = normalize_concepts(all_text)
    technologies = sorted(
        (TECH_LABELS.get(concept, concept.replace("_", " ").title()) for concept in concepts & TECH_CANONICAL),
        key=str.lower,
    )

    def section_text(*keywords: str) -> str:
        matched = [
            chunk.content
            for chunk in chunks
            if any(keyword in (chunk.section or "").lower() for keyword in keywords)
        ]
        return "\n".join(matched) if matched else ""

    summary_source = section_text("abstract", "introduction", "overview")
    if not summary_source:
        summary_source = "\n".join(chunk.content for chunk in chunks[:3])
    summary_sentences = best_sentences(
        "project overview problem solution approach outcome", summary_source, limit=5, max_chars=900
    )
    summary = " ".join(summary_sentences) or project.description or ""
    if project.description and project.description not in summary:
        summary = f"{project.description.strip()}\n\n{summary}".strip()
    summary = truncate(summary, 1200)

    objective_text = section_text("objective", "aim", "goal", "scope")
    objectives: list[str] = []
    for sentence in sentence_split(objective_text or summary_source):
        lowered = sentence.lower()
        if any(word in lowered for word in ("objective", "aim", "goal", "purpose", "this project", "develop", "design")):
            objectives.append(truncate(sentence, 240))
        if len(objectives) >= 6:
            break

    topics = keyword_phrases(all_text, limit=12)
    word_count = sum(doc.word_count for doc in ready)
    chunk_count = sum(doc.chunk_count for doc in ready)
    readiness = 0
    if ready:
        readiness = int(
            min(
                100,
                35
                + min(30, chunk_count * 0.35)
                + min(20, len(sections) * 2.5)
                + min(15, word_count / 300),
            )
        )

    return {
        "project_id": project.id,
        "title": project.title,
        "description": project.description,
        "status": project.status,
        "summary": summary or "No analysed document content yet.",
        "objectives": objectives[:6],
        "technologies": technologies[:18],
        "topics": topics,
        "sections": sections[:30],
        "document_count": len(docs),
        "ready_documents": len(ready),
        "chunk_count": chunk_count,
        "word_count": word_count,
        "readiness_score": readiness,
        "embedding": backend_info(),
        "documents": [
            {
                "id": doc.id,
                "filename": doc.filename,
                "file_type": doc.file_type,
                "status": doc.processing_status,
                "pages": doc.page_count,
                "chunks": doc.chunk_count,
                "error": doc.error_message,
                "uploaded_at": doc.created_at.isoformat() if doc.created_at else None,
            }
            for doc in docs
        ],
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def cached_overview(db: Session, project: Project) -> dict[str, Any]:
    overview = build_overview(db, project)
    analysis = project.analysis or {}
    if analysis.get("llm"):
        llm = analysis["llm"]
        overview["summary"] = llm.get("summary") or overview["summary"]
        overview["objectives"] = llm.get("objectives") or overview["objectives"]
        overview["technologies"] = llm.get("technologies") or overview["technologies"]
        overview["topics"] = llm.get("topics") or overview["topics"]
        overview["domain"] = llm.get("domain", "")
        overview["key_components"] = llm.get("key_components", [])
        overview["missing_information"] = llm.get("missing_information", [])
        overview["llm_analysis"] = True
    return overview


def ensure_index(db: Session, project_id: int) -> bool:
    if vector_store.has_index(project_id):
        return True
    count = rebuild_project_index(db, project_id)
    return count > 0


def _keyword_search(db: Session, project_id: int, query: str, limit: int) -> list[dict[str, Any]]:
    chunks = db.execute(
        select(DocumentChunk, Document.filename)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(DocumentChunk.project_id == project_id, Document.processing_status == "ready")
        .order_by(DocumentChunk.id)
        .limit(1200)
    ).all()
    query_concepts = normalize_concepts(query)
    scored: list[tuple[float, DocumentChunk, str]] = []
    for chunk, filename in chunks:
        concepts = normalize_concepts(chunk.content)
        overlap = len(query_concepts & concepts) / (len(query_concepts) + 1.0)
        section_match = 0.15 if any(c in normalize_concepts(chunk.section) for c in query_concepts) else 0.0
        if overlap or section_match:
            scored.append((overlap + section_match, chunk, filename))
    scored.sort(key=lambda item: item[0], reverse=True)
    results = []
    for score, chunk, filename in scored[:limit]:
        results.append(
            {
                "chunk_id": chunk.id,
                "document_id": chunk.document_id,
                "filename": filename,
                "page_number": chunk.page_number,
                "section": chunk.section,
                "content": chunk.content,
                "score": round(score, 4),
                "retrieval": "keyword",
            }
        )
    return results


def retrieve(
    db: Session,
    project_id: int,
    query: str,
    top_k: int = 5,
    min_score: float = 0.05,
) -> list[dict[str, Any]]:
    """Retrieve the most relevant project chunks for a semantic query."""
    query = (query or "").strip()
    if not query:
        return []
    results: list[dict[str, Any]] = []
    if ensure_index(db, project_id):
        try:
            vector = embed_text(query)
            hits = vector_store.search(project_id, vector, top_k=top_k)
            chunk_ids = [hit["chunk_id"] for hit in hits if hit.get("score", 0) >= min_score]
            if chunk_ids:
                rows = db.execute(
                    select(DocumentChunk, Document.filename)
                    .join(Document, Document.id == DocumentChunk.document_id)
                    .where(DocumentChunk.id.in_(chunk_ids))
                ).all()
                by_id = {chunk.id: (chunk, filename) for chunk, filename in rows}
                for hit in hits:
                    if hit.get("chunk_id") not in by_id:
                        continue
                    chunk, filename = by_id[hit["chunk_id"]]
                    results.append(
                        {
                            "chunk_id": chunk.id,
                            "document_id": chunk.document_id,
                            "filename": filename,
                            "page_number": chunk.page_number,
                            "section": chunk.section,
                            "content": chunk.content,
                            "score": hit.get("score", 0),
                            "retrieval": "vector",
                        }
                    )
        except Exception:  # pragma: no cover - index corruption guard
            logger.exception("Vector retrieval failed; using keyword fallback")
    if not results:
        results = _keyword_search(db, project_id, query, top_k)
    return results[:top_k]


def retrieve_multi(
    db: Session, project_id: int, queries: list[str], top_k: int = 6
) -> list[dict[str, Any]]:
    seen: dict[int, dict[str, Any]] = {}
    per_query = max(2, top_k // max(len(queries), 1))
    for query in queries:
        for hit in retrieve(db, project_id, query, top_k=per_query):
            existing = seen.get(hit["chunk_id"])
            if not existing or hit["score"] > existing["score"]:
                seen[hit["chunk_id"]] = hit
    return sorted(seen.values(), key=lambda item: item["score"], reverse=True)[:top_k]


def build_context(retrievals: list[dict[str, Any]], max_chars: int = 6000) -> str:
    blocks = []
    used = 0
    for item in retrievals:
        block = (
            f"[{item.get('filename')} | p.{item.get('page_number')} | "
            f"{item.get('section')}]\n{item.get('content', '')}"
        )
        if used + len(block) > max_chars:
            break
        blocks.append(block)
        used += len(block)
    return "\n\n---\n\n".join(blocks)


def sources_from_retrieval(retrievals: list[dict[str, Any]], limit: int = 4) -> list[dict[str, Any]]:
    sources = []
    seen = set()
    for item in retrievals:
        key = (item.get("document_id"), item.get("page_number"), item.get("section"))
        if key in seen:
            continue
        seen.add(key)
        sources.append(
            {
                "chunk_id": item.get("chunk_id"),
                "document_id": item.get("document_id"),
                "filename": item.get("filename"),
                "page_number": item.get("page_number"),
                "section": item.get("section"),
                "snippet": truncate(item.get("content", ""), 260),
                "score": item.get("score"),
            }
        )
        if len(sources) >= limit:
            break
    return sources


def resolve_chunk_sources(
    db: Session, project_id: int, chunk_ids: list[int], fallback: list[dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    if not chunk_ids:
        return sources_from_retrieval(fallback or [])
    rows = db.execute(
        select(DocumentChunk, Document.filename)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(
            DocumentChunk.id.in_(chunk_ids),
            DocumentChunk.project_id == project_id,
        )
    ).all()
    sources = []
    for chunk, filename in rows:
        sources.append(
            {
                "chunk_id": chunk.id,
                "document_id": chunk.document_id,
                "filename": filename,
                "page_number": chunk.page_number,
                "section": chunk.section,
                "snippet": truncate(chunk.content, 260),
            }
        )
    return sources or sources_from_retrieval(fallback or [])


def category_query(category: str, title: str = "") -> str:
    mapping = {
        "Project Introduction": "project overview abstract introduction domain purpose",
        "Problem Statement": "problem statement existing system limitations challenges motivation",
        "Objectives": "objectives aim goals scope purpose",
        "Literature Review": "literature review related work existing systems research gap",
        "Technical Concepts": "technology framework tools concepts working principle",
        "Algorithms and Models": "algorithm model training machine learning methodology",
        "System Architecture": "system architecture modules components data flow design diagram",
        "Implementation": "implementation code development modules workflow",
        "Database Design": "database schema tables relationships primary key normalization",
        "Testing": "testing test cases validation performance evaluation results",
        "Results": "results output accuracy performance screenshots observations",
        "Real-World Applications": "applications use cases real world impact users",
        "Limitations": "limitations challenges drawbacks constraints",
        "Future Scope": "future scope enhancements improvements next steps",
    }
    return f"{mapping.get(category, category)} {title}".strip()


def category_from_section(section: str) -> str:
    lowered = (section or "").lower()
    rules = [
        ("introduction", "Project Introduction"), ("abstract", "Project Introduction"),
        ("problem", "Problem Statement"), ("objective", "Objectives"), ("aim", "Objectives"),
        ("literature", "Literature Review"), ("survey", "Literature Review"),
        ("architecture", "System Architecture"), ("design", "System Architecture"),
        ("database", "Database Design"), ("schema", "Database Design"),
        ("implementation", "Implementation"), ("algorithm", "Algorithms and Models"),
        ("model", "Algorithms and Models"), ("methodology", "Technical Concepts"),
        ("test", "Testing"), ("result", "Results"), ("evaluation", "Results"),
        ("application", "Real-World Applications"), ("limitation", "Limitations"),
        ("future", "Future Scope"), ("conclusion", "Future Scope"),
    ]
    for needle, category in rules:
        if needle in lowered:
            return category
    return "Technical Concepts"


def section_heading(line: str) -> str:
    return canonical_section(re.sub(r"^#+\s*", "", line))
