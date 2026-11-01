export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  theme: "light" | "dark" | "system";
  default_difficulty: "basic" | "intermediate" | "advanced" | "mixed";
  tts_enabled: boolean;
  created_at: string;
  project_count?: number;
  session_count?: number;
  completed_sessions?: number;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface DocumentItem {
  id: number;
  project_id: number;
  filename: string;
  file_type: string;
  size_bytes: number;
  processing_status: "pending" | "processing" | "ready" | "failed" | string;
  error_message?: string | null;
  page_count: number;
  word_count: number;
  chunk_count: number;
  created_at: string;
  processed_at?: string | null;
}

export interface Project {
  id: number;
  title: string;
  description: string;
  domain: string;
  status: string;
  created_at: string;
  updated_at: string;
  document_count: number;
  ready_documents: number;
  session_count: number;
  latest_score: number | null;
  documents: DocumentItem[];
}

export interface ProjectOverview {
  project_id: number;
  title: string;
  description: string;
  status: string;
  summary: string;
  objectives: string[];
  technologies: string[];
  topics: string[];
  sections: string[];
  document_count: number;
  ready_documents: number;
  chunk_count: number;
  word_count: number;
  readiness_score: number;
  embedding: string;
  domain?: string;
  key_components?: string[];
  missing_information?: string[];
  llm_analysis?: boolean;
  documents: Array<{
    id: number;
    filename: string;
    file_type: string;
    status: string;
    pages: number;
    chunks: number;
    error?: string | null;
    uploaded_at?: string | null;
  }>;
  generated_at: string;
}

export interface ProjectDetail extends Project {
  overview: ProjectOverview;
  recent_sessions: Array<{
    id: number;
    status: string;
    difficulty: string;
    overall_score: number | null;
    started_at: string | null;
  }>;
}

export interface SourceReference {
  chunk_id?: number | null;
  document_id?: number | null;
  filename?: string | null;
  page_number?: number | null;
  section?: string | null;
  snippet?: string | null;
  score?: number | null;
  note?: string;
}

export interface Question {
  id?: number;
  category: string;
  question_text?: string;
  question?: string;
  difficulty: string;
  is_followup?: boolean;
  sequence?: number;
  source_reference?: SourceReference;
  sources?: SourceReference[];
  expected_answer?: string;
  engine?: string;
}

export interface Evaluation {
  id?: number;
  answer_id?: number;
  technical_accuracy: number;
  relevance: number;
  completeness: number;
  conceptual_understanding: number;
  clarity: number;
  total_score: number;
  strengths: string[];
  missing_concepts: string[];
  mistakes: string[];
  corrected_answer: string;
  reference_answer: string;
  improvement_suggestions: string[];
  source_references: SourceReference[];
  feedback: string;
  sufficient_context?: boolean;
  engine: string;
  created_at?: string;
  input_type?: string;
  answer_text?: string;
  question_text?: string;
  category?: string;
  difficulty?: string;
}

export interface SessionSummary {
  id: number;
  project_id: number;
  project_title?: string | null;
  difficulty: string;
  duration_minutes: number;
  question_count: number;
  mode: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  overall_score: number | null;
  answered_count?: number;
  total_questions?: number;
  progress?: number;
  elapsed_minutes?: number;
  current_question?: Question | null;
}

export interface Turn {
  question_id: number;
  question: string;
  category: string;
  difficulty: string;
  is_followup: boolean;
  source_reference?: SourceReference;
  expected_answer?: string;
  answer_id: number | null;
  answer_text: string | null;
  input_type: string | null;
  submitted_at: string | null;
  evaluation: Evaluation | null;
  score: number | null;
}

export interface SessionDetail extends SessionSummary {
  turns: Turn[];
}

export interface SessionReport {
  id: number;
  session_id: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  improvement_plan: string[];
  category_breakdown: Array<{
    category: string;
    average_score: number;
    verdict: string;
  }>;
  overall_score: number;
  engine: string;
  readiness?: string;
  examiner_remarks?: string;
  created_at: string;
  turns?: Turn[];
}

export interface StartVivaResponse {
  session: SessionSummary;
  question: Question | null;
  engine: string;
}

export interface AnswerResult {
  completed: boolean;
  evaluation: Evaluation | null;
  evaluation_meta?: {
    question: string;
    category: string;
    difficulty: string;
    answer_text: string;
    reference_answer?: string;
    source_reference?: SourceReference;
  } | null;
  followup_generated: boolean;
  next_question: Question | null;
  session: SessionSummary;
  report: SessionReport | null;
}

export interface HistoryResponse {
  items: Array<
    SessionSummary & {
      answered_count: number;
      progress: number;
    }
  >;
  total: number;
  page: number;
  page_size: number;
}

export interface DashboardData {
  summary: {
    total_sessions: number;
    completed_sessions: number;
    total_questions: number;
    average_score: number;
    highest_answer_score: number;
    highest_session_score: number;
    overall_performance: string;
    overall_score: number;
    improvement: number | null;
    total_projects: number;
    ready_documents: number;
    open_recommendations: number;
    strong_topic_count: number;
    weak_topic_count: number;
  };
  strong_topics: string[];
  weak_topics: string[];
  average_topics: string[];
  category_scores: Array<{
    category: string;
    average_score: number;
    attempts: number;
    verdict: string;
  }>;
  difficulty_scores: Array<{
    difficulty: string;
    average_score: number;
    attempts: number;
  }>;
  criteria_scores: Array<{ criterion: string; key: string; score: number }>;
  trend: Array<{
    session_id: number;
    date: string | null;
    score: number;
    difficulty: string;
    status: string;
    project: string;
  }>;
  topic_distribution: Array<{ name: string; value: number; color: string }>;
  recurring_missing_concepts: Array<{ concept: string; count: number }>;
  recent_sessions: SessionSummary[];
  active_session: {
    id: number;
    project_id: number;
    project_title: string;
    status: string;
    difficulty: string;
    question_count: number;
  } | null;
  scoring_weights: Record<string, number>;
  ai_mode: string;
  filters: Record<string, unknown>;
}

export interface Recommendation {
  id: number;
  project_id: number | null;
  topic: string;
  recommendation: string;
  practice_questions: string[];
  priority: string;
  status: "open" | "done" | string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface VoiceCapabilities {
  speech_to_text: {
    local_whisper: boolean;
    gemini_audio: boolean;
    browser_fallback: boolean;
    provider: string;
  };
  text_to_speech: {
    gtts: boolean;
    browser_fallback: boolean;
    provider: string;
  };
}

export interface AIStatus {
  llm: { enabled: boolean; mode?: string; model?: string; message?: string };
  embeddings: string;
  voice: VoiceCapabilities;
  scoring_weights: Record<string, number>;
  mode: string;
  note: string;
}

export interface GeneratedQuestion {
  category: string;
  question: string;
  difficulty: string;
  expected_answer: string;
  source_chunk_ids?: number[];
  source_reference: SourceReference;
  engine: string;
}

export interface EvaluationListItem {
  answer_id: number;
  session_id: number;
  project_id: number;
  question: string;
  category: string;
  difficulty: string;
  answer_text: string;
  input_type: string;
  submitted_at: string | null;
  evaluation: Evaluation;
}
