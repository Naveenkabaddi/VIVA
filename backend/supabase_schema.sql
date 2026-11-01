-- ============================================================================
-- VIVA Platform - Complete PostgreSQL Schema for Supabase
-- ============================================================================
-- Paste this script into your Supabase Dashboard -> SQL Editor and click RUN.
-- It creates all required tables, relationships, cascade rules, and indexes.
-- ============================================================================

-- 1. Alembic version tracking
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL PRIMARY KEY
);

INSERT INTO alembic_version (version_num)
VALUES ('c4f58b9fdf91')
ON CONFLICT (version_num) DO NOTHING;

-- 2. Users table (Unique login credentials & profile)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'student',
    theme VARCHAR(10) NOT NULL DEFAULT 'light',
    default_difficulty VARCHAR(20) NOT NULL DEFAULT 'mixed',
    tts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);

-- 3. Projects (strictly isolated per user)
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    domain VARCHAR(120) NOT NULL DEFAULT '',
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    analysis JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS ix_projects_user_status ON projects(user_id, status);

-- 4. Documents (uploaded project reports)
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    stored_path VARCHAR(512) NOT NULL,
    file_type VARCHAR(20) NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    processing_status VARCHAR(30) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    page_count INTEGER NOT NULL DEFAULT 0,
    word_count INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_documents_project_id ON documents(project_id);
CREATE INDEX IF NOT EXISTS ix_documents_project_status ON documents(project_id, processing_status);

-- 5. Document Chunks & Vector embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    section VARCHAR(255) NOT NULL,
    page_number INTEGER NOT NULL,
    token_count INTEGER NOT NULL,
    embedding JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS ix_document_chunks_project_id ON document_chunks(project_id);
CREATE INDEX IF NOT EXISTS ix_chunks_project_doc ON document_chunks(project_id, document_id);

-- 6. Viva Sessions (conducted per user per project)
CREATE TABLE IF NOT EXISTS viva_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    difficulty VARCHAR(20) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    question_count INTEGER NOT NULL,
    mode VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    overall_score FLOAT,
    current_sequence FLOAT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_viva_sessions_user_id ON viva_sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_viva_sessions_project_id ON viva_sessions(project_id);
CREATE INDEX IF NOT EXISTS ix_sessions_user_status ON viva_sessions(user_id, status);

-- 7. Questions
CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES viva_sessions(id) ON DELETE CASCADE,
    category VARCHAR(80) NOT NULL,
    question_text TEXT NOT NULL,
    difficulty VARCHAR(20) NOT NULL,
    expected_answer TEXT NOT NULL,
    source_reference JSONB,
    is_followup BOOLEAN NOT NULL DEFAULT FALSE,
    sequence FLOAT NOT NULL,
    engine VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_questions_project_id ON questions(project_id);
CREATE INDEX IF NOT EXISTS ix_questions_session_id ON questions(session_id);

-- 8. Answers
CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES viva_sessions(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
    answer_text TEXT NOT NULL,
    input_type VARCHAR(20) NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_answers_session_id ON answers(session_id);
CREATE INDEX IF NOT EXISTS ix_answers_question_id ON answers(question_id);

-- 9. Evaluations (Scores & Detailed Feedback)
CREATE TABLE IF NOT EXISTS evaluations (
    id SERIAL PRIMARY KEY,
    answer_id INTEGER NOT NULL UNIQUE REFERENCES answers(id) ON DELETE CASCADE,
    session_id INTEGER NOT NULL REFERENCES viva_sessions(id) ON DELETE CASCADE,
    accuracy_score FLOAT NOT NULL,
    relevance_score FLOAT NOT NULL,
    completeness_score FLOAT NOT NULL,
    understanding_score FLOAT NOT NULL,
    clarity_score FLOAT NOT NULL,
    total_score FLOAT NOT NULL,
    strengths JSONB NOT NULL,
    missing_concepts JSONB NOT NULL,
    mistakes JSONB NOT NULL,
    corrected_answer TEXT NOT NULL,
    reference_answer TEXT NOT NULL,
    improvement_suggestions JSONB NOT NULL,
    source_references JSONB NOT NULL,
    feedback TEXT NOT NULL,
    sufficient_context BOOLEAN NOT NULL,
    engine VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_evaluations_answer_id ON evaluations(answer_id);
CREATE INDEX IF NOT EXISTS ix_evaluations_session_id ON evaluations(session_id);

-- 10. Session Reports
CREATE TABLE IF NOT EXISTS session_reports (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL UNIQUE REFERENCES viva_sessions(id) ON DELETE CASCADE,
    summary TEXT NOT NULL,
    strengths JSONB NOT NULL,
    weaknesses JSONB NOT NULL,
    improvement_plan JSONB NOT NULL,
    category_breakdown JSONB NOT NULL,
    overall_score FLOAT NOT NULL,
    engine VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_session_reports_session_id ON session_reports(session_id);

-- 11. Recommendations
CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    topic VARCHAR(120) NOT NULL,
    recommendation TEXT NOT NULL,
    practice_questions JSONB NOT NULL,
    priority VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    source VARCHAR(20) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ix_recommendations_user_id ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS ix_recommendations_project_id ON recommendations(project_id);
