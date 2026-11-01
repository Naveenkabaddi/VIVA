"""Text cleaning, section detection, chunking and lightweight NLP helpers.

These utilities deliberately avoid heavyweight NLP dependencies so the RAG and
heuristic evaluation pipeline keeps working even when optional local models are
not installed.
"""
from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass
from difflib import SequenceMatcher

STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "also", "am", "an", "and",
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being", "below",
    "between", "both", "but", "by", "can", "could", "couldn't", "did", "didn't", "do", "does",
    "doesn't", "doing", "don't", "down", "during", "each", "either", "else", "few", "for",
    "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he",
    "her", "here", "hers", "herself", "him", "himself", "his", "how", "i", "if", "in", "into",
    "is", "isn't", "it", "it's", "its", "itself", "just", "me", "might", "more", "most",
    "mustn't", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only",
    "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "shan't",
    "she", "should", "shouldn't", "so", "some", "such", "than", "that", "the", "their",
    "theirs", "them", "themselves", "then", "there", "these", "they", "this", "those",
    "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", "were",
    "weren't", "what", "when", "where", "which", "while", "who", "whom", "why", "will",
    "with", "won't", "would", "wouldn't", "you", "your", "yours", "yourself", "yourselves",
    "using", "used", "use", "via", "within", "across", "per", "may", "many", "much", "one",
    "two", "three", "within", "upon", "among", "etc", "ie", "eg", "able", "like", "well",
}

# Synonym groups used to recognise technically equivalent wording during
# heuristic evaluation. Every term maps to a canonical concept token.
SYNONYM_GROUPS: dict[str, str] = {
    "ml": "machine_learning", "machine learning": "machine_learning",
    "ai": "artificial_intelligence", "artificial intelligence": "artificial_intelligence",
    "dl": "deep_learning", "deep learning": "deep_learning",
    "nn": "neural_network", "neural network": "neural_network", "neural networks": "neural_network",
    "db": "database", "database": "database", "databases": "database", "dbms": "database",
    "sql": "sql", "nosql": "nosql", "rdbms": "database",
    "api": "api", "apis": "api", "rest": "rest_api", "rest api": "rest_api",
    "ui": "user_interface", "ux": "user_experience", "frontend": "frontend", "front end": "frontend",
    "backend": "backend", "back end": "backend",
    "decision tree": "decision_tree", "decision trees": "decision_tree",
    "decision-tree": "decision_tree", "decision-tree model": "decision_tree",
    "dt model": "decision_tree", "dt": "decision_tree",
    "rf": "random_forest", "random forest": "random_forest",
    "svm": "svm", "support vector machine": "svm", "support vector machines": "svm",
    "knn": "knn", "k nearest neighbours": "knn", "k nearest neighbors": "knn",
    "lr": "logistic_regression", "logistic regression": "logistic_regression",
    "linear regression": "linear_regression", "cnn": "cnn", "convolutional neural network": "cnn",
    "rnn": "rnn", "lstm": "lstm", "transformer": "transformer", "transformers": "transformer",
    "nlp": "nlp", "natural language processing": "nlp",
    "cv": "computer_vision", "computer vision": "computer_vision",
    "ocr": "ocr", "optical character recognition": "ocr",
    "jwt": "jwt", "json web token": "jwt", "auth": "authentication",
    "authentication": "authentication", "authorization": "authorization",
    "crud": "crud", "orm": "orm", "object relational mapping": "orm",
    "llm": "llm", "large language model": "llm", "large language models": "llm",
    "rag": "rag", "retrieval augmented generation": "rag",
    "embedding": "embedding", "embeddings": "embedding", "vector database": "vector_database",
    "faiss": "faiss", "chromadb": "chromadb", "postgresql": "postgresql", "postgres": "postgresql",
    "mysql": "mysql", "sqlite": "sqlite", "mongodb": "mongodb", "mongo": "mongodb",
    "react": "react", "reactjs": "react", "react.js": "react", "node": "nodejs", "nodejs": "nodejs",
    "python": "python", "fastapi": "fastapi", "django": "django", "flask": "flask",
    "tailwind": "tailwind", "typescript": "typescript", "javascript": "javascript",
    "gemini": "gemini", "openai": "openai", "gpt": "gpt", "whisper": "whisper",
    "testing": "testing", "test": "testing", "tests": "testing", "unit testing": "unit_testing",
    "integration testing": "integration_testing", "accuracy": "accuracy", "precision": "precision",
    "recall": "recall", "f1": "f1_score", "f1 score": "f1_score",
    "cloud": "cloud", "aws": "aws", "azure": "azure", "gcp": "gcp", "docker": "docker",
    "kubernetes": "kubernetes", "microservice": "microservices", "microservices": "microservices",
    "encryption": "encryption", "hashing": "hashing", "hash": "hashing",
    "scalability": "scalability", "latency": "latency", "throughput": "throughput",
    "cross validation": "cross_validation", "cross-validation": "cross_validation",
    "k fold": "cross_validation", "k-fold": "cross_validation", "cv": "cross_validation",
    "five fold": "cross_validation", "5 fold": "cross_validation",
    "explainable": "interpretability", "explainability": "interpretability",
    "interpretable": "interpretability", "interpretability": "interpretability",
    "nonlinear": "non_linear", "non-linear": "non_linear", "non linear": "non_linear",
    "scikit learn": "scikit_learn", "scikit-learn": "scikit_learn", "sklearn": "scikit_learn",
    "dataset": "dataset", "data set": "dataset", "training": "training", "testing data": "test_data",
    "feature": "feature", "features": "feature", "feature engineering": "feature_engineering",
    "overfitting": "overfitting", "underfitting": "underfitting", "classification": "classification",
    "regression": "regression", "clustering": "clustering", "supervised": "supervised_learning",
    "unsupervised": "unsupervised_learning", "reinforcement learning": "reinforcement_learning",
    "evaluation": "evaluation", "metrics": "metrics", "metric": "metrics",
    "version control": "version_control", "git": "git", "github": "github",
    "requirements": "requirements", "objective": "objective", "objectives": "objective",
    "problem statement": "problem_statement", "scope": "scope", "limitation": "limitations",
    "limitations": "limitations", "future scope": "future_scope", "deployment": "deployment",
    "architecture": "architecture", "methodology": "methodology", "implementation": "implementation",
    "literature survey": "literature_review", "literature review": "literature_review",
}

VAGUE_TERMS = {
    "thing", "things", "stuff", "something", "anything", "everything", "many", "various",
    "some", "etc", "basically", "simply", "just", "obviously", "clearly", "good", "nice",
    "better", "best", "nice", "great", "a lot", "kind of", "sort of", "maybe", "probably",
}

FILLER_PHRASES = {
    "you know", "i mean", "like i said", "as i said", "kind of", "sort of", "umm", "uh",
    "basically", "actually", "literally",
}

# Low-information words that should not count as expected answer concepts even
# when they appear in the reference answer.
GENERIC_CONCEPTS = {
    "use", "uses", "used", "using", "handle", "handles", "handled", "support", "supports",
    "supported", "achieve", "achieves", "achieved", "select", "selects", "selected",
    "selecting", "limit", "limits", "limited", "reduce", "reduces", "reduced", "reducing",
    "implement", "implements", "implemented", "implementing", "validate", "validates",
    "validated", "validate", "capture", "captures", "captured", "reach", "reaches",
    "reaching", "provide", "provides", "allow", "allows", "enable", "enables", "include",
    "includes", "make", "makes", "made", "give", "gives", "take", "takes", "show", "shows",
    "project", "projects", "system", "systems", "answer", "answers", "question", "questions",
    "data", "percent", "number", "way", "thing", "things", "able", "need", "needs",
    "based", "different", "various", "also", "one", "two", "three", "five", "six",
    "first", "second", "result", "results", "well", "much", "many", "even",
}

SECTION_ALIASES = [
    "abstract", "introduction", "problem statement", "problem definition", "motivation",
    "objectives", "objective", "aim", "scope", "literature review", "literature survey",
    "existing system", "proposed system", "methodology", "system architecture", "architecture",
    "design", "implementation", "database design", "database", "data model", "algorithm",
    "algorithms", "model", "models", "training", "testing", "test cases", "results",
    "result", "discussion", "performance evaluation", "evaluation", "applications",
    "limitations", "future scope", "future work", "conclusion", "references", "bibliography",
    "acknowledgement", "acknowledgment", "table of contents", "requirements",
]

HEADING_PATTERN = re.compile(
    r"^\s*(?:(?:chapter|section|unit)\s+)?(?:\d+(?:\.\d+){0,2}[\.\)]?\s+)?"
    r"([A-Z][A-Za-z0-9 ,&/\-\(\)]{2,80})\s*$"
)

INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions", re.I),
    re.compile(r"disregard\s+(the\s+)?(system|previous|above)\s+(prompt|instructions)", re.I),
    re.compile(r"you\s+are\s+now\s+(a|an|the)\s+", re.I),
    re.compile(r"(system|developer)\s+prompt", re.I),
    re.compile(r"<\|im_(start|end)\|>", re.I),
    re.compile(r"reveal\s+(your|the)\s+(api|secret|system)", re.I),
    re.compile(r"do\s+not\s+follow\s+(the\s+)?(rules|instructions)", re.I),
]


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "")
    text = text.replace("\u00ad", "").replace("\u200b", "").replace("\ufeff", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def clean_document_text(text: str) -> str:
    """Remove repeated headers/footers, page numbers and noise from extracted text."""
    text = normalize_text(text)
    lines = text.splitlines()
    cleaned: list[str] = []
    line_counts = Counter(line.strip() for line in lines if 3 < len(line.strip()) < 120)
    for line in lines:
        stripped = line.strip()
        if re.fullmatch(r"(page\s*)?\d{1,4}(\s*of\s*\d{1,4})?", stripped, re.I):
            continue
        if stripped.startswith("--- PAGE") or stripped.startswith("[[PAGE"):
            cleaned.append(stripped)
            continue
        # Repeated short lines are almost always running headers/footers.
        if stripped and len(stripped) < 80 and line_counts.get(stripped, 0) > 5:
            continue
        stripped = re.sub(r"\.{5,}\s*\d+$", "", stripped)
        cleaned.append(stripped)
    text = "\n".join(cleaned)
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def sentence_split(text: str) -> list[str]:
    text = normalize_text(text)
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9(])|\n{2,}", text)
    sentences = [re.sub(r"\s+", " ", part).strip() for part in parts]
    return [s for s in sentences if len(s) > 2]


def is_heading(line: str) -> bool:
    candidate = line.strip().lstrip("#").strip().strip(":").strip()
    if not candidate or len(candidate) > 90:
        return False
    lower = re.sub(r"^\d+(\.\d+)*[\.\)]?\s*", "", candidate).lower().strip()
    if lower in SECTION_ALIASES:
        return True
    words = candidate.split()
    if 1 <= len(words) <= 10 and (candidate.upper() == candidate or candidate.istitle()):
        if any(lower.startswith(alias) for alias in SECTION_ALIASES):
            return True
        if re.match(r"^(chapter|section|unit)\b", lower):
            return True
    match = HEADING_PATTERN.match(candidate)
    if match and 1 <= len(candidate.split()) <= 10 and not candidate.endswith("."):
        return bool(re.search(r"[A-Z]", candidate)) and not re.search(r"\s{2,}", candidate)
    return False


def canonical_section(line: str) -> str:
    body = re.sub(r"^#+\s*", "", line.strip())
    body = re.sub(r"^\s*(?:chapter|section|unit)?\s*\d+(?:\.\d+)*[\.\)]?\s*", "", body, flags=re.I)
    body = re.sub(r"[:.\-]+$", "", body).strip()
    return body[:120] or "General"


@dataclass
class Chunk:
    content: str
    section: str
    page_number: int
    chunk_index: int


def chunk_pages(
    pages: list[tuple[int, str]],
    target_chars: int = 1400,
    overlap_chars: int = 220,
    min_chars: int = 80,
) -> list[Chunk]:
    """Split page text into overlapping chunks while tracking sections/pages."""
    chunks: list[Chunk] = []
    current_section = "General"
    buffer = ""
    buffer_section = current_section
    buffer_page = pages[0][0] if pages else 1
    index = 0

    def flush(force: bool = False) -> None:
        nonlocal buffer, index, buffer_section, buffer_page
        content = buffer.strip()
        if len(content) >= min_chars or (force and content):
            chunks.append(
                Chunk(
                    content=content,
                    section=buffer_section,
                    page_number=buffer_page,
                    chunk_index=index,
                )
            )
            index += 1
        buffer = ""

    for page_number, page_text in pages:
        text = clean_document_text(page_text)
        if not text:
            continue
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                if buffer:
                    buffer += "\n"
                continue
            if is_heading(line) and len(line.split()) <= 12:
                # Flush accumulated text *before* switching sections so every
                # chunk is labelled with the heading it actually belongs to.
                if buffer.strip():
                    flush(force=True)
                current_section = canonical_section(line)
                buffer_section = current_section
                buffer_page = page_number
                buffer = line + "\n"
                continue
            if not buffer:
                buffer_section = current_section
                buffer_page = page_number
            buffer += line + "\n"
            if len(buffer) >= target_chars:
                flush()
                tail = chunks[-1].content[-overlap_chars:] if chunks else ""
                buffer = tail
                buffer_section = current_section
                buffer_page = page_number
                if overlap_chars <= 0:
                    buffer = ""
    flush(force=True)
    return chunks


def content_tokens(text: str) -> list[str]:
    text = normalize_text(text).lower()
    raw = re.findall(r"[a-z][a-z0-9_+#.\-]{1,}", text)
    tokens = []
    for token in raw:
        token = token.strip("._+#-")
        if token and token not in STOPWORDS and len(token) > 1:
            tokens.append(token)
    return tokens


def _concept_occurrences(text: str) -> list[tuple[str, str, int]]:
    """Return ordered (canonical, readable label, position) concept hits.

    Multi-word synonyms are matched first and their words are consumed so that
    "decision tree" does not also produce separate "decision"/"tree" concepts.
    """
    lowered = normalize_text(text).lower()
    lowered = re.sub(r"[\-_]", " ", lowered)
    lowered = re.sub(r"[^a-z0-9\s]", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    if not lowered:
        return []

    consumed = [False] * len(lowered)
    found: list[tuple[str, str, int]] = []
    for phrase, canonical in sorted(SYNONYM_GROUPS.items(), key=lambda item: -len(item[0])):
        if " " not in phrase:
            continue
        normalized_phrase = re.sub(r"[\-_]", " ", phrase).lower()
        pattern = r"(?<![a-z0-9])" + re.escape(normalized_phrase) + r"(?![a-z0-9])"
        for match in re.finditer(pattern, lowered):
            if any(consumed[match.start():match.end()]):
                continue
            found.append((canonical, normalized_phrase, match.start()))
            for index in range(match.start(), match.end()):
                consumed[index] = True

    for match in re.finditer(r"[a-z0-9]+", lowered):
        if consumed[match.start()]:
            continue
        token = match.group()
        if token.isdigit() or token in STOPWORDS or len(token) < 3:
            continue
        found.append((SYNONYM_GROUPS.get(token, token), token, match.start()))

    found.sort(key=lambda item: item[2])
    return found


def normalize_concepts(text: str) -> set[str]:
    """Map text to canonical concept tokens (synonyms collapsed)."""
    return {canonical for canonical, _, _ in _concept_occurrences(text)}


def _concept_match(left: str, right: str) -> bool:
    """Accept exact canonical matches and close morphological variants."""
    if left == right:
        return True
    if min(len(left), len(right)) < 5:
        return False
    if left in right or right in left:
        return True
    return SequenceMatcher(None, left, right).ratio() >= 0.86


def _key_concept_items(reference: str, limit: int = 14) -> list[tuple[str, str]]:
    """Pick the informative concepts a strong answer is expected to cover."""
    technical = set(SYNONYM_GROUPS.values())
    unique: dict[str, tuple[str, int]] = {}
    for canonical, label, position in _concept_occurrences(reference):
        if canonical in GENERIC_CONCEPTS or canonical in unique:
            continue
        unique[canonical] = (label, position)

    def rank(item: tuple[str, tuple[str, int]]) -> tuple[float, int]:
        canonical, (label, position) = item
        weight = 0.0
        if canonical in technical:
            weight += 2.0
        if " " in label:
            weight += 1.0
        if len(label) >= 7:
            weight += 0.5
        return (-weight, position)

    ordered = sorted(unique.items(), key=rank)
    return [(canonical, label) for canonical, (label, _) in ordered[:limit]]


def extract_key_concepts(reference: str, limit: int = 14) -> list[str]:
    """Return readable labels for the most informative reference concepts."""
    return [label for _, label in _key_concept_items(reference, limit)]


def keyword_phrases(text: str, limit: int = 12) -> list[str]:
    """Extract salient technical noun phrases for question generation."""
    text = normalize_text(text)
    phrases = re.findall(
        r"\b([A-Z][A-Za-z0-9\-]+(?:\s+[A-Z][A-Za-z0-9\-]+){0,2}|"
        r"[a-z]+(?:ing|tion|ment|ity|ance|ence|ness|ism|ics)\b)\b",
        text,
    )
    counts = Counter()
    for phrase in phrases:
        cleaned = phrase.strip()
        tokens = content_tokens(cleaned)
        if 1 <= len(tokens) <= 3 and len(cleaned) > 3:
            counts[cleaned] += 1
    return [phrase for phrase, _ in counts.most_common(limit)]


def sentence_similarity(a: str, b: str) -> float:
    ta, tb = set(content_tokens(a)), set(content_tokens(b))
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / float(len(ta | tb))


def best_sentences(query: str, text: str, limit: int = 4, max_chars: int = 900) -> list[str]:
    query_concepts = normalize_concepts(query)
    scored: list[tuple[float, str]] = []
    for sentence in sentence_split(text):
        if len(sentence) < 30:
            continue
        concepts = normalize_concepts(sentence)
        overlap = len(query_concepts & concepts) / (len(query_concepts) + 1e-6)
        score = overlap + min(len(sentence), 240) / 2000
        scored.append((score, sentence))
    scored.sort(key=lambda item: item[0], reverse=True)
    selected: list[str] = []
    total = 0
    for _, sentence in scored:
        if sentence in selected:
            continue
        selected.append(sentence)
        total += len(sentence)
        if len(selected) >= limit or total >= max_chars:
            break
    return selected


def neutralize_prompt_injection(text: str) -> str:
    """Treat uploaded documents as data: defang common instruction-injection lines."""
    if not text:
        return ""
    neutralized = text
    for pattern in INJECTION_PATTERNS:
        neutralized = pattern.sub("[filtered untrusted instruction]", neutralized)
    neutralized = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", neutralized)
    return neutralized


def wrap_untrusted(label: str, text: str, max_chars: int = 6000) -> str:
    safe = neutralize_prompt_injection(text)[:max_chars]
    return f"<{label}>\n{safe}\n</{label}>"


def truncate(text: str, limit: int) -> str:
    text = normalize_text(text)
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def lexical_score(answer: str, reference: str, context: str = "") -> dict[str, object]:
    """Deterministic answer scoring used by the offline evaluator and as a
    sanity check for LLM scores. Returns criterion scores in 0..100, readable
    concept lists and diagnostic flags.

    Coverage is measured against the reference answer, never against the whole
    document context: retrieved chunks are supporting evidence and would
    otherwise dilute the expected concepts.
    """
    answer = (answer or "").strip()
    reference_text = (reference or "").strip()
    if not reference_text:
        reference_text = (context or "").strip()
    if not answer:
        return {
            "empty": True, "vague": True, "very_short": True,
            "accuracy": 0, "relevance": 0, "completeness": 0,
            "understanding": 0, "clarity": 0, "coverage": 0.0,
            "key_concepts": extract_key_concepts(reference_text),
            "missing_concepts": extract_key_concepts(reference_text),
            "matched_concepts": [], "word_count": 0,
        }

    answer_concepts = normalize_concepts(answer)
    key_items = _key_concept_items(reference_text, limit=14)
    matched: list[str] = []
    missing: list[str] = []
    matched_canonical: set[str] = set()
    for canonical, label in key_items:
        if any(_concept_match(canonical, candidate) for candidate in answer_concepts):
            matched.append(label)
            matched_canonical.add(canonical)
        else:
            missing.append(label)
    coverage = len(matched) / max(len(key_items), 1)

    # Concept-level F1 rewards answers that do not add unrelated technical
    # claims while still covering the reference material.
    reference_concepts = {
        concept for concept in normalize_concepts(reference_text)
        if concept not in GENERIC_CONCEPTS
    }
    answer_informative = {
        concept for concept in answer_concepts
        if concept not in GENERIC_CONCEPTS
    }
    overlap = reference_concepts & answer_informative
    precision = len(overlap) / max(len(answer_informative), 1)
    recall = len(overlap) / max(len(reference_concepts), 1)
    concept_f1 = (
        2 * precision * recall / (precision + recall)
        if precision + recall > 0
        else 0.0
    )
    semantic = 0.7 * coverage + 0.3 * concept_f1

    words = re.findall(r"[A-Za-z][A-Za-z0-9\-']+", answer)
    word_count = len(words)
    unique_ratio = len(set(w.lower() for w in words)) / max(word_count, 1)
    vague_hits = sum(1 for term in VAGUE_TERMS if re.search(r"\b" + re.escape(term) + r"\b", answer.lower()))
    filler_hits = sum(answer.lower().count(phrase) for phrase in FILLER_PHRASES)
    vague = word_count < 8 or (vague_hits >= 2 and word_count < 25)
    very_short = word_count < 5

    accuracy = semantic * 100
    if word_count >= 15:
        accuracy += 3
    if vague:
        accuracy *= 0.6
    if very_short:
        accuracy *= 0.35

    relevance = min(100.0, (0.8 * coverage + 0.2 * precision) * 100)
    if "not enough information" in reference_text.lower():
        relevance = max(relevance, 55)
    if vague:
        relevance *= 0.55

    completeness = coverage * 100
    if len(reference_text.split()) >= 20 and word_count < 0.5 * len(reference_text.split()):
        completeness *= 0.88
    if very_short:
        completeness *= 0.3

    # Understanding rewards connecting multiple reference concepts and using
    # explanatory sentence structure rather than merely listing words.
    understanding = semantic * 100
    if re.search(r"\b(because|therefore|so that|which means|in order to|allows|enables|results in|selected it|chose it)\b", answer, re.I):
        understanding += 10
    if very_short:
        understanding *= 0.3
    understanding = min(understanding, 100)

    clarity = 68 + (10 if 10 <= word_count <= 140 else 0)
    if 30 <= word_count <= 180:
        clarity += 8
    if re.search(r"[.!?]", answer):
        clarity += 6
    clarity -= min(vague_hits * 6, 18)
    clarity -= min(filler_hits * 4, 12)
    if very_short:
        clarity = min(clarity, 45)
    if word_count > 260:
        clarity -= 8  # rambling is not clarity

    scores = {
        "accuracy": int(round(max(0, min(accuracy, 100)))),
        "relevance": int(round(max(0, min(relevance, 100)))),
        "completeness": int(round(max(0, min(completeness, 100)))),
        "understanding": int(round(max(0, min(understanding, 100)))),
        "clarity": int(round(max(0, min(clarity, 100)))),
    }
    return {
        "empty": False,
        "vague": vague,
        "very_short": very_short,
        "coverage": round(coverage, 3),
        "key_concepts": [label for _, label in key_items],
        "matched_concepts": matched,
        "missing_concepts": missing,
        "word_count": word_count,
        **scores,
    }


def weighted_total(scores: dict[str, float], weights: dict[str, float]) -> float:
    total = (
        scores.get("technical_accuracy", scores.get("accuracy", 0)) * weights["technical_accuracy"]
        + scores.get("relevance", 0) * weights["relevance"]
        + scores.get("completeness", 0) * weights["completeness"]
        + scores.get("conceptual_understanding", scores.get("understanding", 0)) * weights["conceptual_understanding"]
        + scores.get("clarity", 0) * weights["clarity"]
    )
    return round(max(0.0, min(total, 100.0)), 1)


def normalize_filename(name: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", name or "document")
    return name[:120].strip("._") or "document"
