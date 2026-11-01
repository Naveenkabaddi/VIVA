# Architecture

## 1. System context

```text
+-----------------------------+          +--------------------------------------+
| React SPA (Vite)            |  HTTPS   | FastAPI application                  |
| - auth/theme/toast contexts | -------> | - JWT auth + rate limit middleware   |
| - pages, charts, voice UI   |  /api    | - REST route modules                 |
| - axios API client          | <------- | - services (RAG, viva, evaluation,   |
+-----------------------------+          |   reports, analytics, voice)         |
                                         +-------------------+------------------+
                                                             |
                       +-------------------------------------+-------------------------------+
                       |                                     |                               |
             +---------v----------+              +-----------v-----------+       +-----------v-----------+
             | SQLAlchemy 2.0     |              | Local file storage    |       | External providers    |
             | SQLite/PostgreSQL  |              | uploads + vector idx  |       | Gemini (optional)     |
             | ORM + Alembic      |              | JSON/NPY/FAISS        |       | Whisper/gTTS optional |
             +--------------------+              +-----------------------+       +-----------------------+
```

The backend is a modular monolith. Routes contain HTTP concerns; services contain
business logic; SQLAlchemy models define persistence; Pydantic schemas define the
public contract. The frontend is a single-page application that talks only to the
REST API.

## 2. Backend layers

```text
app/
  main.py              FastAPI app, CORS, middleware, lifespan, health
  api/
    deps.py            current-user dependency, DB session, ownership guards
    router.py          aggregates all route modules under /api
    routes/            auth, projects, documents, ai, viva, evaluation,
                       analytics, recommendations, voice
  core/
    config.py          pydantic-settings configuration
    security.py        bcrypt hashing, JWT encode/decode, password policy
    middleware.py      request logging, sliding-window rate limiter
    errors.py          AppError + consistent JSON exception handlers
    logging.py         application logging setup
  db/
    models.py          SQLAlchemy declarative models
    session.py         engine and session factory
    init_db.py         startup migration runner
  schemas/
    auth.py            auth/profile contracts
    project.py         projects, documents, AI request/response contracts
    viva.py            viva, evaluation, recommendation, voice contracts
    llm.py             validated JSON shapes returned by Gemini
  services/
    document_service.py   validation, extraction, chunking, indexing, deletion
    embeddings.py         sentence-transformers or hashing embedder
    vector_store.py       FAISS or NumPy index persistence and search
    rag.py                overview building, retrieval, source references
    question_service.py   question plans, deduplication, follow-ups
    viva_service.py       session lifecycle and answer orchestration
    evaluation_service.py five-criterion evaluation and score validation
    report_service.py     per-session reports and turn history
    analytics_service.py  dashboard, trends, topic and criteria aggregates
    recommendation_service.py prioritised study recommendations
    voice_service.py      transcription, synthesis and capability detection
    llm.py / prompts.py   Gemini client, retries and prompt templates
```

Startup (`lifespan`) performs three steps: create storage directories, apply
pending Alembic migrations (unless `AUTO_MIGRATE=false`), and log the active LLM,
embedding and voice providers.

## 3. Request and authorization flow

1. `POST /api/auth/register` or `/api/auth/login` returns a signed HS256 JWT and
   the user profile.
2. The frontend stores the token under `viva_token` and sends
   `Authorization: Bearer <token>` on every API call.
3. `get_current_user` decodes the token, loads the user and rejects inactive or
   missing accounts with 401/403.
4. Resource routes call ownership helpers (`get_owned_project`,
   `get_owned_session`, document ownership joins) before reading or mutating
   data. Cross-user access returns 404, not another user's data.
5. `viva:unauthorized` is emitted by the frontend API client on 401 responses so
   the auth context can clear the session and redirect to login.

The API returns a consistent error body:

```json
{ "detail": "Human-readable message", "code": "machine_readable_code" }
```

Validation errors add an `errors` array. Unhandled errors log a stack trace and
return a generic 500 message.

## 4. Document intelligence pipeline

```text
Upload (multipart)
  -> extension allowlist + streaming size limit + magic-byte check
  -> store under uploads/user_<id>/project_<id>/<uuid>_<name>
  -> create Document(status=pending), respond 202
  -> BackgroundTasks: process_document(document_id)
       -> extract text (PyMuPDF / python-docx / UTF-8 text)
       -> detect section headings and page numbers
       -> normalise text and chunk with overlap
       -> embed chunks in batches
       -> replace DocumentChunk rows and rebuild the project vector index
       -> Document(status=ready) with page/word/chunk counts
       -> Project(status=ready)
```

Processing errors are stored on the document (`processing_status=failed`,
`error_message`) and the project returns to an editable state. `GET
/api/documents/{id}/status` is the polling endpoint used by the UI. Reprocessing
and deletion clean up old chunks, index files and stored uploads.

Chunking keeps section metadata and page numbers so every retrieval can be
traced back to a file, page and section. Embeddings are stored both in the
database (for rebuilds) and in the persisted project index.

## 5. Retrieval-augmented generation

`build_overview` summarises the project from ready documents: abstract/intro
sentences, objectives, technologies, keyword topics, detected sections, word and
chunk counts, and a readiness score. `cached_overview` overlays validated Gemini
analysis when available.

Retrieval flow:

1. Ensure a vector index exists, rebuilding it from database chunks if needed.
2. Embed the query and search the project index.
3. Convert index records back to database chunks, preserving file, page,
   section, content and similarity score.
4. If the vector path has no usable hits, fall back to keyword search over
   chunks.
5. `retrieve_multi` merges results from several category queries and deduplicates
   by chunk.

Embedding backends:

- `sentence-transformers` when installed and `EMBEDDING_BACKEND` allows it.
- Deterministic hashed bag-of-words with unigram and bigram features otherwise
  (384 dimensions, L2-normalised).

Index backends:

- FAISS `IndexFlatIP` when `faiss` is importable.
- NumPy dot-product search over persisted `.npy` vectors otherwise.

Both use cosine similarity because vectors are normalised. Index metadata is
stored as JSON next to the vectors, and a corrupt or missing index is rebuilt
from the database.

## 6. Question generation and adaptive viva

Question categories: Project Introduction, Problem Statement, Objectives,
Literature Review, Technical Concepts, Algorithms and Models, System
Architecture, Implementation, Database Design, Testing, Results, Real-World
Applications, Limitations, Future Scope.

Difficulty levels: `basic`, `intermediate`, `advanced`, or `mixed`.

Generation strategy:

1. Select categories evenly across the requested set.
2. Resolve difficulty per question (mixed rotates through levels).
3. Retrieve category-specific excerpts and pick a grounded keyword.
4. Render a category/difficulty template or ask Gemini for a JSON question list.
5. Reject near-duplicate questions using token-set Jaccard similarity.
6. Attach expected answer, source references and the active engine.

Session lifecycle:

```text
POST /viva/start
  -> create VivaSession(status=active)
  -> generate initial question plan; store Questions with sequence numbers
  -> return session + first question

POST /viva/{id}/answer
  -> validate session is active and question belongs to it
  -> store Answer (one answer per question)
  -> evaluate the answer (five criteria)
  -> optionally add a follow-up question based on score and missing concepts
  -> complete the session when the target count or duration is reached
  -> return evaluation, next question, session progress, report when complete

pause / resume: flip status and timestamps
next-question: peek at the current unanswered question
end: stop early, finalise the session and generate a report
report / finalize: return the stored or generated report
delete: remove the session and cascaded answers/evaluations/report
```

Follow-up policy in the offline engine:

- score below 45: step back to the core idea;
- 45-74: ask for a specific design decision and supporting evidence;
- 75 and above: ask an advanced design-review or alternative-approach question.

## 7. Evaluation design

Five criteria are scored from 0 to 100:

| Criterion | Weight | Field |
| --- | ---: | --- |
| Technical accuracy | 30% | `technical_accuracy` |
| Relevance | 20% | `relevance` |
| Completeness | 20% | `completeness` |
| Conceptual understanding | 20% | `conceptual_understanding` |
| Explanation clarity | 10% | `clarity` |

The total is always recomputed from these weights:

```text
total = 0.30*accuracy + 0.20*relevance + 0.20*completeness
      + 0.20*understanding + 0.10*clarity
```

The deterministic lexical scorer always runs. It measures reference-concept
coverage, relevance to the question, length/completeness signals, understanding
signals and structural clarity. Empty, vague and very short answers are capped.

With Gemini enabled, semantic scores are requested as validated JSON
(`LLMEvaluation`). The service:

1. validates the schema and clamps every criterion to 0-100;
2. recomputes the weighted total from the criteria (it never trusts a
   model-supplied total);
3. applies the same vague/empty caps as the offline path;
4. falls back to the deterministic result if the call or validation fails.

Reference answers come from a stored expected answer, retrieved project text, or
Gemini grounded in retrieved excerpts. When no grounded source exists, the
response marks `sufficient_context=false` and does not invent a citation.
`source_references` always come from actual retrieved chunks.

## 8. Reports, analytics and recommendations

- **Session report:** summary, strengths, weaknesses, improvement plan, category
  breakdown, overall score, engine and per-turn history. Generated at completion
  (or on finalize) and stored in `session_reports`.
- **Analytics:** computed on demand from evaluations and sessions. Returns
  summary counts and averages, strong/average/weak topics, category and
  difficulty breakdowns, five criteria averages, session trend, recurring
  missing concepts, topic distribution, recent sessions, active session, applied
  filters and the scoring weights.
- **Recommendations:** derive weak categories and recurring missing concepts,
  produce prioritised study advice with practice questions, and support
  open/done status changes. New generation replaces stale open entries for the
  same scope while preserving completed ones.

## 9. Voice architecture

The browser owns the default voice experience:

- SpeechRecognition (when available) fills the answer textarea.
- SpeechSynthesis reads examiner questions.
- Users can edit the transcript before submission.

Server capabilities are detected per request:

- `faster-whisper` for local transcription, otherwise Gemini audio when a key is
  configured, otherwise the browser fallback.
- `gTTS` for server audio, otherwise browser synthesis.

Voice transcripts are reviewed and submitted through the normal answer endpoint,
so they receive exactly the same evaluation, follow-up and reporting treatment as
typed answers. Audio uploads are limited to 15 MB and an allowlist of audio
extensions.

## 10. Data model

```text
users
  id, name, email (unique), password_hash, role, theme,
  default_difficulty, tts_enabled, is_active, created_at

projects
  id, user_id -> users.id, title, description, domain, status,
  analysis (JSON), created_at, updated_at

documents
  id, project_id -> projects.id, filename, stored_path, file_type,
  size_bytes, processing_status, error_message, page_count,
  word_count, chunk_count, processed_at, created_at

document_chunks
  id, document_id -> documents.id, project_id -> projects.id,
  chunk_index, content, section, page_number, token_count,
  embedding (JSON), created_at

viva_sessions
  id, user_id, project_id, difficulty, duration_minutes, question_count,
  mode, status, started_at, completed_at, paused_at, overall_score,
  current_sequence, created_at

questions
  id, project_id, session_id -> viva_sessions.id, category, question_text,
  difficulty, expected_answer, source_reference (JSON), is_followup,
  sequence, engine, created_at

answers
  id, session_id, question_id (unique), answer_text, input_type,
  submitted_at, created_at

evaluations
  id, answer_id (unique), session_id, five criterion scores, total_score,
  strengths/missing_concepts/mistakes (JSON), corrected_answer,
  reference_answer, improvement_suggestions/source_references (JSON),
  feedback, sufficient_context, engine, created_at

recommendations
  id, user_id, project_id (nullable), topic, recommendation,
  practice_questions (JSON), priority, status, source, created_at, updated_at

session_reports
  id, session_id (unique), summary, strengths/weaknesses/improvement_plan
  (JSON), category_breakdown (JSON), overall_score, engine, created_at
```

Foreign keys use `ON DELETE CASCADE`. Deleting a user cascades through projects,
documents, chunks, sessions, questions, answers, evaluations, reports and
recommendations. File and vector cleanup is performed by the service layer.
SQLite enforces foreign keys through SQLAlchemy configuration; PostgreSQL
enforces them natively.

## 11. Frontend architecture

```text
main.tsx
  -> App.tsx
       -> BrowserRouter
       -> AuthProvider (token, profile, login/register/logout)
       -> ThemeProvider (light/dark/system, persisted and synced to profile)
       -> ToastProvider
       -> Routes
            public: /, /login, /register
            protected: /dashboard, /projects, /projects/:id, /documents,
                       /viva/new, /viva/:id, /viva/:id/report, /analytics,
                       /recommendations, /history, /practice, /voice,
                       /profile, /settings
            fallback: *
```

- `lib/api.ts` is the single axios instance. It injects the token, normalises API
  errors, emits `viva:unauthorized`, and exposes typed helper calls.
- `lib/types.ts` mirrors the API contracts.
- `components/UI.tsx` and `components/Widgets.tsx` provide reusable cards,
  buttons, inputs, badges, charts, stat tiles and empty states.
- `components/VoiceRecorder.tsx` wraps browser speech recognition and synthesis
  and degrades gracefully when APIs are missing.
- `context/` holds auth, theme and toast state; pages stay focused on data
  fetching and rendering.
- Vite proxies `/api` to the backend in development; `VITE_API_URL` overrides the
  base URL for standalone deployments.
- The production build splits React, charts and icons into vendor chunks.

## 12. Fallback matrix

| Capability | Preferred | Fallback | Effect |
| --- | --- | --- | --- |
| Question generation | Gemini JSON | Deterministic templates | Same API shape, `engine` changes |
| Evaluation | Gemini semantic scores | Lexical scorer | Same criteria and weighted total |
| Project analysis | Gemini summary | Extractive overview | Grounded in report text |
| Recommendations | Gemini advice | Heuristic weak-topic plan | Same recommendation schema |
| Embeddings | sentence-transformers | Hashed 384-d vectors | Lower semantic precision |
| Vector search | FAISS | NumPy cosine search | Same retrieval contract |
| Speech-to-text | faster-whisper / Gemini | Browser SpeechRecognition | Text still evaluated normally |
| Text-to-speech | gTTS | Browser SpeechSynthesis | Same examiner text |

## 13. Extension points

- Replace the in-memory rate limiter with a Redis-backed implementation for
  multi-worker deployments.
- Move document processing to Celery/RQ or a managed queue for large reports.
- Add database-backed or hosted vector search for very large corpora.
- Add rubric templates per institution or exam type.
- Add exports (PDF/DOCX) from the stored session report.
- Add refresh tokens or OAuth if longer-lived sessions are required.
