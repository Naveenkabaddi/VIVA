"""Persistent project-level vector index.

FAISS is used when available, otherwise a NumPy dot-product index provides the
same cosine search semantics. Metadata is stored beside the index so the index
survives backend restarts; if files are missing it can be rebuilt from the DB.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

try:  # pragma: no cover - optional dependency
    import faiss  # type: ignore

    FAISS_AVAILABLE = True
except Exception:  # pragma: no cover
    faiss = None
    FAISS_AVAILABLE = False


def _dir() -> Path:
    settings.ensure_directories()
    return settings.vector_path


def _paths(project_id: int) -> tuple[Path, Path, Path]:
    base = _dir()
    return (
        base / f"project_{project_id}.json",
        base / f"project_{project_id}.npy",
        base / f"project_{project_id}.faiss",
    )


def save_index(project_id: int, records: list[dict], embeddings: np.ndarray) -> int:
    """Persist metadata + vectors for a project. Records must match rows."""
    meta_path, vec_path, faiss_path = _paths(project_id)
    metadata = {
        "project_id": project_id,
        "backend": "faiss" if FAISS_AVAILABLE else "numpy",
        "count": len(records),
        "records": records,
    }
    np.save(vec_path, np.asarray(embeddings, dtype=np.float32))
    if FAISS_AVAILABLE and len(embeddings):
        index = faiss.IndexFlatIP(embeddings.shape[1])
        index.add(np.asarray(embeddings, dtype=np.float32))
        faiss.write_index(index, str(faiss_path))
    elif faiss_path.exists():
        faiss_path.unlink(missing_ok=True)
    meta_path.write_text(json.dumps(metadata), encoding="utf-8")
    logger.info("Saved vector index for project %s (%s chunks)", project_id, len(records))
    return len(records)


def has_index(project_id: int) -> bool:
    meta_path, vec_path, _ = _paths(project_id)
    return meta_path.exists() and vec_path.exists()


def load_index(project_id: int) -> tuple[list[dict], np.ndarray] | None:
    meta_path, vec_path, _ = _paths(project_id)
    if not meta_path.exists() or not vec_path.exists():
        return None
    try:
        metadata = json.loads(meta_path.read_text(encoding="utf-8"))
        embeddings = np.load(vec_path)
        if len(metadata.get("records", [])) != embeddings.shape[0]:
            return None
        return metadata.get("records", []), embeddings
    except Exception as exc:  # pragma: no cover - corrupt index
        logger.warning("Could not load vector index for project %s: %s", project_id, exc)
        return None


def search(project_id: int, query_vector: np.ndarray, top_k: int = 5) -> list[dict]:
    loaded = load_index(project_id)
    if not loaded:
        return []
    records, embeddings = loaded
    if not len(records) or embeddings.size == 0:
        return []
    query = np.asarray(query_vector, dtype=np.float32).reshape(1, -1)
    qnorm = float(np.linalg.norm(query))
    if qnorm == 0:
        return []
    query /= qnorm
    top_k = max(1, min(top_k, len(records)))
    if FAISS_AVAILABLE:
        _, vec_path, faiss_path = _paths(project_id)
        try:
            if not faiss_path.exists():
                raise FileNotFoundError
            index = faiss.read_index(str(faiss_path))
            if index.ntotal != len(records):
                raise ValueError("FAISS index out of sync")
            scores, indices = index.search(query, top_k)
        except Exception:
            scores, indices = _numpy_search(embeddings, query, top_k)
    else:
        scores, indices = _numpy_search(embeddings, query, top_k)
    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0 or idx >= len(records):
            continue
        item = dict(records[int(idx)])
        item["score"] = round(float(score), 4)
        results.append(item)
    return results


def _numpy_search(embeddings: np.ndarray, query: np.ndarray, top_k: int):
    scores = embeddings @ query[0]
    order = np.argsort(-scores)[:top_k]
    return np.array([scores[order]]), np.array([order])


def delete_index(project_id: int) -> None:
    for path in _paths(project_id):
        path.unlink(missing_ok=True)
