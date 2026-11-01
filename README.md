# VivaForge - AI Viva Preparation Platform

VivaForge turns a project report into an adaptive mock viva. Upload a PDF, DOCX or
TXT report, let the platform build a grounded project knowledge base, answer
examiner questions by text or voice, and get criterion-level feedback, analytics
and a personalised preparation plan.

The application is a monorepo with a FastAPI backend and a React/Vite frontend.
It is designed to run completely offline with a deterministic examiner engine,
and to use Google Gemini for higher-quality analysis, question generation,
evaluation and recommendations when `GEMINI_API_KEY` is set.

## Feature overview

| Area | What it does |
| --- | --- |
| Document intelligence | Extracts text from PDF/DOCX/TXT, detects report sections, chunks content, embeds chunks and persists a per-project vector index. |
| Retrieval (RAG) | Grounds questions, reference answers and feedback in retrieved report excerpts instead of inventing content. |
| Adaptive mock viva | Generates a question plan by category/difficulty, adapts follow-ups, supports pause/resume, enforces duration and question targets, and produces a final report. |
| Answer evaluation | Scores technical accuracy, relevance, completeness, conceptual understanding and explanation clarity, with evidence, mistakes, missing concepts and improvement suggestions. |
| Analytics | Dashboard summary, score trends, category strengths/weaknesses, difficulty breakdown, recurring missing concepts and recent sessions. |
| Recommendations | Prioritised study topics with practice questions, derived from weak categories and recurring gaps. |
| Voice interaction | Browser speech recognition/synthesis fallback, optional Whisper transcription and optional gTTS synthesis. Voice answers flow through the same evaluation pipeline as typed answers. |
| Accounts and privacy | JWT authentication, bcrypt password hashing, per-user data isolation, profile/preferences, password change, full account deletion. |

## Tech stack

- **Backend:** Python 3.10+, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic
- **Database:** SQLite by default; PostgreSQL supported through `DATABASE_URL`
- **AI:** Google Gemini (optional), PyMuPDF, python-docx, NumPy
- **Retrieval:** sentence-transformers (optional) with a deterministic 384-dimensional hashing embedder fallback; FAISS (optional) with a NumPy cosine index fallback
- **Voice:** faster-whisper / Gemini audio (optional), gTTS (optional), browser SpeechRecognition/SpeechSynthesis fallback
- **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS, React Router 6, Axios, Recharts, Lucide

## Repository layout

```text
viva/
  backend/
    app/
      api/            # route modules and dependencies
      core/           # settings, security, middleware, errors, logging
      db/             # ORM models, engine/session, startup bootstrap
      schemas/        # Pydantic request/response and LLM schemas
      services/       # RAG, documents, viva, evaluation, reports, analytics, voice
      main.py         # FastAPI app factory entrypoint
    migrations/       # Alembic environment and versions
    storage/          # uploaded files and vector indexes (generated)
    tests/            # pytest suite
    alembic.ini
    requirements.txt
  frontend/
    src/
      components/     # layout, UI primitives, widgets, voice recorder
      context/        # auth, theme, toast providers
      lib/            # API client, types, utilities, speech helpers
      pages/          # 18 application pages
      App.tsx         # routes and provider wiring
    vite.config.ts
  docs/
    ARCHITECTURE.md
    API.md
    DEPLOYMENT.md
  .env.example
```

## Quick start

### Prerequisites

- Python 3.10 or newer
- Node.js 18 or newer
- npm 9 or newer

### 1. Backend

From the repository root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set a long random `SECRET_KEY`. A Gemini key is optional.

Start the API:

```powershell
cd backend
$env:PYTHONPATH = "."
..\.venv\Scripts\uvicorn app.main:app --reload --port 8000
```

On macOS/Linux use `source .venv/bin/activate`, `cp .env.example .env` and
`uvicorn app.main:app --reload --port 8000`.

Useful URLs:

- API root: `http://127.0.0.1:8000/`
- Health: `http://127.0.0.1:8000/api/health`
- Swagger UI: `http://127.0.0.1:8000/api/docs`
- ReDoc: `http://127.0.0.1:8000/api/redoc`

At startup the backend applies all pending Alembic migrations and creates the
upload/vector directories. A fresh SQLite database is created automatically.

### 2. Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` to
`http://127.0.0.1:8000`, so no CORS configuration is needed for local
development.

### 3. First run

1. Register an account.
2. Create a project and upload a report (PDF, DOCX or TXT up to 20 MB).
3. Wait for document processing to reach `ready`.
4. Start a mock viva, answer the questions and finish the session.
5. Review the report, analytics and recommendations.

## Configuration

Copy `.env.example` to `.env` in the repository root. The most important values:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SECRET_KEY` | development placeholder | JWT signing key. Change this in every real deployment. |
| `DATABASE_URL` | `sqlite:///./viva.db` | SQLAlchemy URL. Use `postgresql+psycopg://user:pass@host:5432/db` for PostgreSQL. |
| `AUTO_MIGRATE` | `true` | Apply Alembic migrations at startup. Set `false` when migrations run as a separate deploy step. |
| `CORS_ORIGINS` | local Vite origins | Comma-separated allowed frontend origins. |
| `GEMINI_API_KEY` | empty | Empty enables the offline examiner engine. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model used by the LLM client. |
| `EMBEDDING_BACKEND` | `auto` | `auto`, `sentence-transformers` or `hashing`. |
| `UPLOAD_DIR` / `VECTOR_DIR` | `./storage/...` | File and vector index storage. Relative paths resolve against `backend/`. |
| `MAX_UPLOAD_MB` | `20` | Document upload limit. |
| `RATE_LIMIT_PER_MINUTE` | `120` | Per-IP request limit; `0` disables it. |
| `SCORE_WEIGHT_*` | 0.30/0.20/0.20/0.20/0.10 | Evaluation weights. They must sum to 1.0. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` | JWT lifetime (7 days). |

The frontend reads `VITE_API_URL` (default `/api`). For a separately hosted API,
set it to the public API base URL, for example `https://api.example.com/api`.

## Offline and Gemini modes

`GET /api/ai/status` reports the active mode.

- **Offline mode (default, no API key):** project analysis, question generation,
  evaluation, reports and recommendations run through deterministic lexical and
  heuristic services. All core features work without network access.
- **Gemini mode:** the same services retrieve project excerpts, ask Gemini for
  structured JSON, validate it with Pydantic, recompute weighted totals from the
  five criteria, and fall back to the offline path if the call fails or returns
  invalid data.

Optional local upgrades:

```powershell
# Better semantic embeddings and faster vector search
pip install sentence-transformers faiss-cpu

# Local speech-to-text and server-side text-to-speech
pip install faster-whisper gTTS
```

These packages are intentionally not required. Without them, the hashing
embedder, NumPy index and browser speech APIs keep the application functional.

## Database and migrations

Schema changes are managed with Alembic. With the virtual environment active,
from `backend/`:

```powershell
$env:PYTHONPATH = "."
alembic upgrade head          # apply migrations
alembic current               # show current revision
alembic check                 # detect model/schema drift
alembic revision --autogenerate -m "describe change"
```

The initial migration creates every table, index and foreign key used by the
application. It has been applied, rolled back and re-applied against SQLite, and
`alembic check` reports no drift.

For PostgreSQL, install the pinned `psycopg` driver (included in
`requirements.txt`), set `DATABASE_URL`, and run `alembic upgrade head` before
starting the API. The driver imports successfully and the initial migration
compiles to PostgreSQL DDL (`alembic upgrade head --sql`), but no PostgreSQL
server was available in the development environment, so the live PostgreSQL path
has not been exercised end-to-end here.

## Tests

Backend (43 tests):

```powershell
cd backend
$env:PYTHONPATH = "."
..\.venv\Scripts\python -m pytest tests -q --tb=short
```

The suite covers authentication and access control, projects, document
processing, retrieval, viva lifecycle, evaluation weighting, analytics,
recommendations, voice fallbacks, validation and data deletion. Tests use an
isolated temporary SQLite database and temporary storage directories.

Frontend:

```powershell
cd frontend
npm run lint    # TypeScript type check
npm run build   # production build
```

## Production build

```powershell
cd frontend
npm run build
```

The output is written to `frontend/dist/`. Serve it with a static web server and
reverse-proxy `/api` to the FastAPI process, or configure `VITE_API_URL` to the
public API origin before building.

For backend deployment details, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API reference](docs/API.md)
- [Deployment guide](docs/DEPLOYMENT.md)

## Verified status

The following was exercised in this repository:

- Backend test suite: **43 passed** (Python 3.10, SQLite, offline mode).
- Live HTTP smoke test against a running uvicorn server (SQLite, offline mode):
  registration, project creation, TXT upload and processing (585 words,
  15 chunks), ad-hoc evaluation with the weighted-score check, viva
  start/pause/resume, four answered turns through to the generated report,
  session history and detail, analytics, recommendation generation/update,
  voice capabilities/synthesis fallback, cross-user isolation (`404`) and
  account deletion followed by rejected re-login.
- Alembic initial migration: upgrade, downgrade and re-upgrade on SQLite;
  `alembic check` reports no pending operations. The same revision compiles to
  PostgreSQL DDL offline.
- Frontend production build: `tsc -b && vite build` succeeds; output is split
  into application, React, chart and icon chunks.
- Document processing, mock viva flow, evaluation, analytics, recommendations
  and account deletion are covered by automated tests.

Not exercised locally:

- Live Gemini requests (no API key configured).
- A running PostgreSQL instance.
- Optional `sentence-transformers`, `faiss-cpu`, `faster-whisper` and `gTTS`
  packages (all fallbacks are active instead).
- A full interactive browser walkthrough against a live backend.

## Security notes

- Passwords are hashed with bcrypt; JWTs are signed with HS256 and validated on
  every protected request.
- Every project, document, session, evaluation and recommendation query is
  scoped to the authenticated user.
- Uploads are extension-checked, size-limited, content-sniffed for PDF/DOCX and
  stored with generated filenames under per-user/per-project directories.
- Prompt templates explicitly mark document excerpts as untrusted data, and all
  Gemini responses are schema-validated before use.
- The API has per-IP sliding-window rate limiting, request logging and
  consistent JSON errors.
- Account deletion requires the current password and cascades to projects,
  documents, chunks, sessions, answers, evaluations, reports and
  recommendations, while removing stored files and vector indexes.
- Never commit `.env` or real API keys. The repository `.gitignore` excludes
  environment files, databases, uploads and vector indexes.

## Known limitations

- The rate limiter is in-memory and per-process; use a shared store such as
  Redis when running multiple backend workers or instances.
- Document processing runs in FastAPI background tasks, so a single process must
  stay alive while a document is processing. Use a task queue for large-scale
  deployments.
- The offline examiner is deterministic and lexical; Gemini materially improves
  semantic grading and question variety.
- Large reports are chunked and capped before analysis; extremely long reports
  may not have every paragraph represented in a single overview.
- Voice quality depends on the browser or the optional local models.
