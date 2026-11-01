"""Embedding providers.

`auto` prefers Sentence Transformers when installed; otherwise a deterministic
hashed bag-of-words embedder (384 dimensions) keeps retrieval fully functional
offline. Both produce L2-normalised vectors so cosine similarity == dot product.
"""
from __future__ import annotations

import hashlib
import logging
import math
import threading
from collections import Counter

import numpy as np

from app.core.config import settings
from app.services.text_utils import content_tokens

logger = logging.getLogger(__name__)

HASH_DIM = 384
_model = None
_backend_name: str | None = None
_lock = threading.Lock()


def _load_sentence_transformer():
    global _model
    try:
        from sentence_transformers import SentenceTransformer  # type: ignore

        logger.info("Loading embedding model %s", settings.embedding_model)
        _model = SentenceTransformer(settings.embedding_model)
        return _model
    except Exception as exc:  # pragma: no cover - optional dependency
        logger.warning("Sentence Transformers unavailable (%s); using hashing embedder.", exc)
        return None


def _resolve_backend() -> str:
    global _backend_name
    if _backend_name:
        return _backend_name
    with _lock:
        if _backend_name:
            return _backend_name
        requested = (settings.embedding_backend or "auto").lower()
        if requested == "sentence-transformers":
            if _load_sentence_transformer() is not None:
                _backend_name = "sentence-transformers"
            else:
                logger.warning("Requested sentence-transformers but it is not usable; falling back.")
                _backend_name = "hashing"
        elif requested == "hashing":
            _backend_name = "hashing"
        else:
            if _load_sentence_transformer() is not None:
                _backend_name = "sentence-transformers"
            else:
                _backend_name = "hashing"
        logger.info("Embedding backend: %s", _backend_name)
        return _backend_name


def backend_info() -> dict[str, object]:
    backend = _resolve_backend()
    return {
        "backend": backend,
        "dimension": embedding_dimension(),
        "model": settings.embedding_model if backend == "sentence-transformers" else "hashed-tf-384",
    }


def embedding_dimension() -> int:
    if _resolve_backend() == "sentence-transformers" and _model is not None:
        try:
            return int(_model.get_sentence_embedding_dimension())
        except Exception:  # pragma: no cover
            return HASH_DIM
    return HASH_DIM


def _hash_embed(text: str) -> np.ndarray:
    vector = np.zeros(HASH_DIM, dtype=np.float32)
    tokens = content_tokens(text)
    if not tokens:
        return vector
    features = Counter(tokens)
    for i in range(len(tokens) - 1):
        features[f"{tokens[i]}_{tokens[i + 1]}"] += 0.6
    for feature, count in features.items():
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        bucket = int.from_bytes(digest[:4], "little") % HASH_DIM
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        vector[bucket] += sign * (1.0 + math.log(count))
    norm = float(np.linalg.norm(vector))
    if norm > 0:
        vector /= norm
    return vector


def embed_texts(texts: list[str], batch_size: int = 32) -> np.ndarray:
    if not texts:
        return np.zeros((0, embedding_dimension()), dtype=np.float32)
    backend = _resolve_backend()
    if backend == "sentence-transformers" and _model is not None:
        vectors = _model.encode(
            texts, batch_size=batch_size, normalize_embeddings=True, show_progress_bar=False
        )
        return np.asarray(vectors, dtype=np.float32)
    return np.vstack([_hash_embed(text) for text in texts])


def embed_text(text: str) -> np.ndarray:
    return embed_texts([text])[0]
