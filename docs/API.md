# API Reference

Base URL: `/api` (development: `http://127.0.0.1:8000/api`).

Interactive documentation is always authoritative for the running build:

- Swagger UI: `/api/docs`
- ReDoc: `/api/redoc`
- OpenAPI JSON: `/api/openapi.json`

All request and response bodies are JSON unless noted. Timestamps are ISO 8601
strings. IDs are integers.

## Authentication

Protected endpoints require:

```http
Authorization: Bearer <access_token>
```

Tokens are HS256 JWTs signed with `SECRET_KEY`. The default lifetime is 7 days
(`ACCESS_TOKEN_EXPIRE_MINUTES=10080`). There is no refresh-token flow; log in
again when a token expires.

| Method | Path | Auth | Description |
| --- | --- | ---: | --- |
| POST | `/auth/register` | No | Create an account and receive a token. |
| POST | `/auth/login` | No | Exchange email/password for a token. |
| GET | `/auth/me` | Yes | Profile plus project/session counts. |
| PATCH | `/auth/me` | Yes | Update name, theme, default difficulty, TTS preference. |
| POST | `/auth/change-password` | Yes | Change password; returns 204. |
| DELETE | `/auth/me` | Yes | Delete the account and all data; returns 204. |

### Register

```json
{
  "name": "Asha Rao",
  "email": "asha@example.com",
  "password": "VivaPass123"
}
```

Password policy: at least 8 characters, with at least one letter and one number.

Response `201`:

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "name": "Asha Rao",
    "email": "asha@example.com",
    "role": "student",
    "theme": "light",
    "default_difficulty": "mixed",
    "tts_enabled": true,
    "created_at": "2026-10-31T12:00:00+00:00"
  }
}
```

Login uses `{ "email", "password" }` and returns the same shape.

### Update profile

```json
{
  "name": "Asha R.",
  "theme": "dark",
  "default_difficulty": "advanced",
  "tts_enabled": false
}
```

All fields are optional. `theme` is `light`, `dark` or `system`;
`default_difficulty` is `basic`, `intermediate`, `advanced` or `mixed`.

### Change password

```json
{ "current_password": "VivaPass123", "new_password": "NewVivaPass456" }
```

Returns `204`. The new password must satisfy the policy and differ from the
current password.

### Delete account

```json
{ "password": "VivaPass123" }
```

Returns `204`. Deletes projects, documents, chunks, sessions, answers,
evaluations, reports, recommendations, uploaded files and vector indexes.

## Errors and limits

Errors use:

```json
{ "detail": "Human-readable message", "code": "machine_readable_code" }
```

Validation errors (`422`) also include:

```json
{
  "detail": "body.email: value is not a valid email address",
  "code": "validation_error",
  "errors": [{ "loc": ["body", "email"], "msg": "value is not a valid email address" }]
}
```

Common status codes: `400` invalid operation, `401` missing/invalid token,
`403` disabled account, `404` not found or not owned by the user, `409` conflict
or wrong state, `413` upload too large, `422` validation failure, `429` rate
limited, `500` unexpected error.

The API applies a per-IP sliding-window limit (`RATE_LIMIT_PER_MINUTE`, default
120). `429` responses include `Retry-After`.

## System

| Method | Path | Auth | Description |
| --- | --- | ---: | --- |
| GET | `/health` | No | Service, LLM, embedding, voice and scoring status. |

`GET /health` is the only `/api` path excluded from rate limiting.

## Projects

| Method | Path | Auth | Description |
| --- | --- | ---: | --- |
| GET | `/projects` | Yes | List the user's projects. |
| POST | `/projects` | Yes | Create a project. |
| GET | `/projects/{project_id}` | Yes | Project detail with overview and recent sessions. |
| PATCH | `/projects/{project_id}` | Yes | Update title, description or domain. |
| DELETE | `/projects/{project_id}` | Yes | Delete project, files, vectors and related data. |

Create request:

```json
{
  "title": "Campus Placement Prediction System",
  "description": "An explainable placement readiness predictor.",
  "domain": "Machine Learning"
}
```

`title` is required (2-255 characters); the other fields are optional.

The project detail response adds `overview` (summary, objectives, technologies,
topics, sections, counts, readiness score, embedding info, document list) and
`recent_sessions` to the standard project fields (`document_count`,
`ready_documents`, `session_count`, `latest_score`, `documents`).

## Documents

| Method | Path | Auth | Description |
| --- | --- | ---: | --- |
| POST | `/documents/upload` | Yes | Upload and queue a report; returns `202`. |
| GET | `/documents` | Yes | List documents, optionally filtered by `project_id`. |
| GET | `/documents/{document_id}/status` | Yes | Poll processing status. |
| GET | `/documents/{document_id}/content` | Yes | Extracted text and chunk metadata. |
| POST | `/documents/{document_id}/reprocess` | Yes | Re-run processing; returns `202`. |
| DELETE | `/documents/{document_id}` | Yes | Delete the document, chunks and index data. |

Upload is `multipart/form-data`:

| Field | Type | Description |
| --- | --- | --- |
| `project_id` | integer | Target project. |
| `file` | file | PDF, DOCX or TXT, maximum `MAX_UPLOAD_MB` (default 20 MB). |

Response `202`:

```json
{
  "id": 4,
  "project_id": 1,
  "filename": "final_report.pdf",
  "file_type": "pdf",
  "size_bytes": 1834200,
  "processing_status": "pending",
  "error_message": null,
  "page_count": 0,
  "word_count": 0,
  "chunk_count": 0,
  "created_at": "2026-10-31T12:05:00+00:00",
  "processed_at": null
}
```

Poll `GET /documents/4/status` until `processing_status` is `ready` or `failed`:

```json
{
  "id": 4,
  "project_id": 1,
  "processing_status": "ready",
  "message": "Document processed and indexed.",
  "chunk_count": 24,
  "page_count": 18,
  "word_count": 6120,
  "error_message": null,
  "processed_at": "2026-10-31T12:05:09+00:00"
}
```

`GET /documents/{id}/content` is only available when the document is `ready`.

## AI and practice questions

| Method | Path | Auth | Description |
| --- | --- | ---: | --- |
| GET | `/ai/status` | Yes | Active LLM, embedding and voice mode. |
| POST | `/ai/analyze-project` | Yes | Build/refresh the project overview. |
| POST | `/ai/generate-questions` | Yes | Generate practice questions. |
| POST | `/ai/generate-followup` | Yes | Generate one follow-up question. |

### Generate practice questions

```json
{
  "project_id": 1,
  "difficulty": "mixed",
  "count": 6,
  "categories": ["Technical Concepts", "System Architecture", "Testing"]
}
```

`count` is 1-20. If `categories` is empty, the full category set is sampled.

Response:

```json
{
  "project_id": 1,
  "engine": "heuristic",
  "questions": [
    {
      "category": "System Architecture",
      "question": "Walk me through the data flow between the React frontend and the FastAPI backend in your project.",
      "difficulty": "intermediate",
      "expected_answer": "A strong answer should describe ...",
      "source_chunk_ids": [12, 13],
      "source_reference": {
        "document_id": 4,
        "filename": "final_report.pdf",
        "page_number": 7,
        "section": "System Architecture",
        "note": "",
        "sources": [
          {
            "chunk_id": 12,
            "document_id": 4,
            "filename": "final_report.pdf",
            "page_number": 7,
            "section": "System Architecture",
            "snippet": "The React frontend communicates with ...",
            "score": 0.71
          }
        ]
      },
      "engine": "heuristic"
    }
  ]
}
```

The exact `source_reference` shape depends on the engine and whether matching
report content was found.

### Analyze project

```json
{ "project_id": 1 }
```

Returns `project_id`, `engine` and the computed `overview`. Requires at least one
`ready` document; otherwise `409 no_ready_documents`.

### Generate follow-up

```json
{
  "project_id": 1,
  "question": "How does the decision tree predict placement readiness?",
  "answer": "It uses CGPA and aptitude scores.",
  "score": 48,
  "category": "Algorithms and Models",
  "difficulty": "intermediate",
  "missing_concepts": ["feature engineering", "cross-validation"]
}
```

## Mock viva

| Method | Path | Auth | Description |
| --- | --- | ---: | --- |
| POST | `/viva/start` | Yes | Start a session and receive the first question. |
| GET | `/viva/sessions` | Yes | Paginated session history. |
| GET | `/viva/{session_id}` | Yes | Session with progress, current question and turns. |
| POST | `/viva/{session_id}/answer` | Yes | Submit an answer and receive evaluation/next step. |
| GET | `/viva/{session_id}/next-question` | Yes | Peek at the current unanswered question. |
| POST | `/viva/{session_id}/pause` | Yes | Pause an active session. |
| POST | `/viva/{session_id}/resume` | Yes | Resume a paused session. |
| POST | `/viva/{session_id}/end` | Yes | End early and generate the report. |
| GET | `/viva/{session_id}/report` | Yes | Report for a completed session. |
| POST | `/viva/{session_id}/finalize` | Yes | Force report generation. |
| DELETE | `/viva/{session_id}` | Yes | Delete a session and related data. |

### Start

```json
{
  "project_id": 1,
  "difficulty": "mixed",
  "duration_minutes": 20,
  "question_count": 8,
  "mode": "text",
  "categories": []
}
```

Constraints: `duration_minutes` 5-120, `question_count` 3-30, `mode` is `text` or
`voice`, `categories` is a subset of the supported categories.

Response `201`:

```json
{
  "session": {
    "id": 9,
    "project_id": 1,
    "project_title": "Campus Placement Prediction System",
    "difficulty": "mixed",
    "duration_minutes": 20,
    "question_count": 8,
    "mode": "text",
    "status": "active",
    "started_at": "2026-10-31T12:10:00+00:00",
    "completed_at": null,
    "overall_score": null,
    "answered_count": 0,
    "total_questions": 8,
    "progress": 0,
    "elapsed_minutes": 0,
    "current_question": {
      "id": 31,
      "category": "Project Introduction",
      "question_text": "Give a concise overview of your project ...",
      "difficulty": "basic",
      "is_followup": false,
      "sequence": 0,
      "source_reference": {},
      "engine": "heuristic"
    },
    "turns": null
  },
  "question": { "id": 31, "category": "Project Introduction", "...": "..." },
  "engine": "heuristic"
}
```

### Answer

```json
{ "answer_text": "The system predicts placement readiness using ...", "input_type": "text" }
```

`answer_text` is 1-12000 characters; `input_type` is `text` or `voice`.

Response:

```json
{
  "completed": false,
  "evaluation": {
    "id": 44,
    "answer_id": 44,
    "technical_accuracy": 74.0,
    "relevance": 82.0,
    "completeness": 61.0,
    "conceptual_understanding": 70.0,
    "clarity": 80.0,
    "total_score": 72.2,
    "strengths": ["Directly addresses what the examiner asked."],
    "missing_concepts": ["cross-validation", "feature importance"],
    "mistakes": [],
    "corrected_answer": "",
    "reference_answer": "Grounded reference answer ...",
    "improvement_suggestions": ["Explain how the model was validated."],
    "source_references": [
      {
        "chunk_id": 12,
        "document_id": 4,
        "filename": "final_report.pdf",
        "page_number": 7,
        "section": "Methodology",
        "snippet": "The model is evaluated with five-fold cross validation ...",
        "score": 0.68
      }
    ],
    "feedback": "A solid answer that would benefit from ...",
    "sufficient_context": true,
    "engine": "heuristic",
    "created_at": "2026-10-31T12:11:00+00:00"
  },
  "evaluation_meta": {
    "question": "Give a concise overview of your project ...",
    "category": "Project Introduction",
    "difficulty": "basic",
    "answer_text": "The system predicts placement readiness using ...",
    "reference_answer": "Grounded reference answer ...",
    "source_reference": {}
  },
  "followup_generated": true,
  "next_question": { "id": 32, "category": "Algorithms and Models", "...": "..." },
  "session": { "id": 9, "answered_count": 1, "progress": 12.5, "...": "..." },
  "report": null
}
```

The weighted score is always `0.30*accuracy + 0.20*relevance +
0.20*completeness + 0.20*understanding + 0.10*clarity`, rounded to one decimal.

When the session completes, `completed` is `true`, `next_question` is `null` and
`report` contains the generated report. Empty or vague answers receive reduced
scores; they are never accepted as full-credit responses.

### Session history

`GET /viva/sessions?project_id=1&status=completed&page=1&page_size=12`

`page_size` is 1-50. Response includes `items`, `total`, `page`, `page_size`.

### Report

`GET /viva/{session_id}/report` returns:

```json
{
  "id": 5,
  "session_id": 9,
  "summary": "Overall performance ...",
  "strengths": ["Strong understanding of the architecture."],
  "weaknesses": ["Limited discussion of evaluation methodology."],
  "improvement_plan": ["Revise cross-validation and metrics."],
  "category_breakdown": [
    {
      "category": "System Architecture",
      "average_score": 78.5,
      "verdict": "strong"
    }
  ],
  "overall_score": 72.2,
  "engine": "heuristic",
  "created_at": "2026-10-31T12:20:00+00:00",
  "turns": [
    {
      "question_id": 31,
      "question": "Give a concise overview of your project ...",
      "category": "Project Introduction",
      "difficulty": "basic",
      "is_followup": false,
      "source_reference": {},
      "expected_answer": "Grounded expected answer ...",
      "answer_id": 44,
      "answer_text": "The system predicts ...",
      "input_type": "text",
      "submitted_at": "2026-10-31T12:11:00+00:00",
      "evaluation": { "total_score": 72.2, "...": "..." },
      "score": 72.2
    }
  ]
}
```

Only a completed session can be read through this endpoint. `POST /finalize`
forces generation for an active session.

## Answer evaluation

| Method | Path | Auth | Description |
| --- | --- | ---: | --- |
| POST | `/evaluation/evaluate` | Yes | Evaluate a practice answer without a session. |
| GET | `/evaluation` | Yes | Paginated stored evaluations. |
| GET | `/evaluation/{answer_id}` | Yes | Full evaluation, question, answer and session context. |

Ad-hoc request:

```json
{
  "project_id": 1,
  "question": "Why did you choose a decision tree?",
  "answer": "Because it is interpretable and we can explain each split.",
  "expected_answer": "Interpretability, comparison with logistic regression and random forest, and acceptable accuracy.",
  "category": "Algorithms and Models",
  "difficulty": "intermediate"
}
```

The response is the same evaluation object returned inside a viva answer, with
the five criteria, weighted total, evidence, missing concepts, suggestions,
references and engine.

List filters: `session_id`, `project_id`, `page` (default 1), `page_size`
(default 20, maximum 100).

## Analytics

| Method | Path | Auth | Description |
| --- | --- | ---: | --- |
| GET | `/analytics/dashboard` | Yes | Full dashboard payload. |
| GET | `/analytics/performance` | Yes | Same computed payload, intended for trend views. |
| GET | `/analytics/topics` | Yes | Topic and criteria subset. |

Query filters for dashboard/performance: `project_id`, `session_id`,
`difficulty` (`basic`, `intermediate`, `advanced`, `mixed`), `start_date`,
`end_date` (ISO datetimes). Topics accepts `project_id` and `difficulty`.

Dashboard fields:

- `summary`: total/completed sessions, total questions, average score, highest
  answer/session score, performance label, improvement, project/document counts,
  open recommendations, strong/weak topic counts.
- `strong_topics`, `average_topics`, `weak_topics`: category, average score,
  attempts and verdict.
- `category_scores`, `difficulty_scores`, `criteria_scores`.
- `trend`: session score history with date, difficulty, status and project.
- `topic_distribution`: strong/average/weak counts with chart colors.
- `recurring_missing_concepts`: concept and count.
- `recent_sessions`, `active_session`.
- `filters`, `scoring_weights`, `ai_mode`.

An empty account returns zeroed summary values and empty lists rather than an
error.

## Recommendations

| Method | Path | Auth | Description |
| --- | --- | ---: | --- |
| GET | `/recommendations` | Yes | List recommendations. |
| POST | `/recommendations/generate` | Yes | Generate or refresh recommendations. |
| PATCH | `/recommendations/{id}` | Yes | Mark `open` or `done`. |
| DELETE | `/recommendations/{id}` | Yes | Delete a recommendation. |

List filters: `project_id`, `status` (`open` or `done`). Response:

```json
{
  "items": [
    {
      "id": 3,
      "project_id": 1,
      "topic": "Testing and Validation",
      "recommendation": "Revise cross-validation and report precision/recall.",
      "practice_questions": ["How did you prevent overfitting?"],
      "priority": "high",
      "status": "open",
      "source": "heuristic",
      "created_at": "2026-10-31T12:00:00+00:00",
      "updated_at": "2026-10-31T12:00:00+00:00"
    }
  ],
  "total": 1,
  "open": 1,
  "done": 0
}
```

Generate request: `{ "project_id": 1 }` or `{ "project_id": null }` for all
projects. Update request: `{ "status": "done" }`.

## Voice

| Method | Path | Auth | Description |
| --- | --- | ---: | --- |
| GET | `/voice/capabilities` | Yes | Available STT/TTS providers. |
| POST | `/voice/transcribe` | Yes | Transcribe an audio answer. |
| POST | `/voice/synthesize` | Yes | Synthesize examiner speech. |

Capabilities:

```json
{
  "speech_to_text": {
    "local_whisper": false,
    "gemini_audio": false,
    "browser_fallback": true,
    "provider": "browser"
  },
  "text_to_speech": {
    "gtts": false,
    "browser_fallback": true,
    "provider": "browser"
  }
}
```

### Transcribe

`multipart/form-data` fields: `file` (audio, maximum 15 MB) and optional
`language` (default `en`). Supported extensions: webm, ogg, wav, mp3, m4a, mp4,
aac, flac.

```json
{
  "text": "The system uses a decision tree to predict placement readiness.",
  "provider": "browser",
  "language": "en",
  "duration": null
}
```

If no server provider is available, the endpoint returns `422` with a clear
message and the browser speech API is used instead. Submit the reviewed text to
the normal viva answer endpoint.

### Synthesize

```json
{ "text": "Explain the architecture of your project.", "lang": "en", "slow": false }
```

- With gTTS available: `audio/mpeg` binary response and `X-TTS-Provider: gtts`.
- Otherwise: JSON `{ "provider": "browser", "text": "...", "message": "..." }`
  and the browser uses SpeechSynthesis.

Text is limited to 4000 characters.

## Quick end-to-end sequence

```text
POST /auth/register
POST /projects
POST /documents/upload            (multipart)
GET  /documents/{id}/status       (poll until ready)
POST /viva/start
POST /viva/{id}/answer            (repeat)
GET  /viva/{id}/report
GET  /analytics/dashboard
POST /recommendations/generate
GET  /recommendations
DELETE /auth/me                   (optional cleanup)
```
