-- AI Interview Simulator: initial schema.
-- SQLite for the MVP. Embeddings are stored as float32 BLOBs in resume_chunks; on PostgreSQL
-- the same column becomes `vector(256)` with an ivfflat/hnsw index (see docs/ARCHITECTURE.md).

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('candidate', 'recruiter', 'admin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at TEXT
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'recruiter', 'member')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (user_id, organization_id)
);
CREATE INDEX idx_memberships_org ON memberships(organization_id);

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,                 -- sha256 of the cookie token, never the token itself
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  user_agent TEXT
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE candidate_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  headline TEXT,
  target_role TEXT,
  experience_level TEXT CHECK (experience_level IN ('entry', 'mid', 'senior', 'lead') OR experience_level IS NULL),
  accommodations_note TEXT,
  prefers_text_mode INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE resume_documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,    -- safe internal identifier, not derived from the user's file name
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('UPLOADED', 'PARSING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED')),
  progress INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  extracted_text TEXT,
  sections_json TEXT,
  char_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_resume_owner ON resume_documents(owner_id, created_at);

CREATE TABLE resume_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES resume_documents(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  section TEXT NOT NULL,
  heading TEXT,
  text TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  embedding BLOB,
  embedding_model TEXT,
  injection_flagged INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  UNIQUE (document_id, ordinal)
);
CREATE INDEX idx_chunks_owner_doc ON resume_chunks(owner_id, document_id);

CREATE TABLE competencies (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  keywords_json TEXT NOT NULL,
  anchors_json TEXT NOT NULL            -- { "1": "...", "3": "...", "5": "..." }
);

CREATE TABLE job_roles (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  level TEXT,
  competency_keys_json TEXT NOT NULL,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE interview_templates (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  interview_type TEXT NOT NULL,
  description TEXT NOT NULL,
  competency_keys_json TEXT NOT NULL,
  default_questions INTEGER NOT NULL DEFAULT 5
);

CREATE TABLE interview_sessions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  resume_id TEXT REFERENCES resume_documents(id) ON DELETE SET NULL,
  role_id TEXT REFERENCES job_roles(id) ON DELETE SET NULL,
  role_title TEXT NOT NULL,
  job_description TEXT NOT NULL,
  interview_type TEXT NOT NULL CHECK (interview_type IN ('behavioral', 'technical', 'system_design', 'mixed')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  duration_min INTEGER NOT NULL,
  max_questions INTEGER NOT NULL,
  focus_json TEXT NOT NULL DEFAULT '[]',
  answer_mode TEXT NOT NULL DEFAULT 'text' CHECK (answer_mode IN ('voice', 'text')),
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'PREPARING', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED')),
  provider_id TEXT,
  demo_mode INTEGER NOT NULL DEFAULT 1,
  monitoring_policy_json TEXT NOT NULL,
  share_with_org INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  started_at TEXT,
  paused_at TEXT,
  completed_at TEXT,
  total_paused_ms INTEGER NOT NULL DEFAULT 0,
  report_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_sessions_candidate ON interview_sessions(candidate_id, created_at);
CREATE INDEX idx_sessions_org ON interview_sessions(organization_id, share_with_org);

CREATE TABLE interview_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  parent_question_id TEXT REFERENCES interview_questions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('primary', 'follow_up', 'clarification')),
  text TEXT NOT NULL,
  competency_key TEXT NOT NULL,
  rationale TEXT,
  evidence_chunk_ids_json TEXT NOT NULL DEFAULT '[]',
  needs_clarification INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (session_id, ordinal)
);

CREATE TABLE interview_answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES interview_questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  original_text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('text', 'speech')),
  corrected INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  answered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (question_id)
);

CREATE TABLE transcript_segments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES interview_questions(id) ON DELETE CASCADE,
  answer_id TEXT REFERENCES interview_answers(id) ON DELETE CASCADE,
  speaker TEXT NOT NULL CHECK (speaker IN ('ai', 'candidate')),
  text TEXT NOT NULL,
  original_text TEXT NOT NULL,       -- recognition output as received; never overwritten
  corrected INTEGER NOT NULL DEFAULT 0,
  start_ms INTEGER,
  end_ms INTEGER,
  confidence REAL,                   -- informational only; never used to score
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_transcript_session ON transcript_segments(session_id, created_at);

CREATE TABLE answer_evaluations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES interview_questions(id) ON DELETE CASCADE,
  answer_id TEXT NOT NULL REFERENCES interview_answers(id) ON DELETE CASCADE,
  competency_key TEXT NOT NULL,
  overall_score REAL NOT NULL,
  dimension_scores_json TEXT NOT NULL,
  explanation TEXT NOT NULL,
  excerpts_json TEXT NOT NULL,
  missing_evidence_json TEXT NOT NULL,
  suggestions_json TEXT NOT NULL,
  uncertainty TEXT,
  provider_id TEXT,
  assessment_kind TEXT NOT NULL CHECK (assessment_kind IN ('ai_assisted', 'mock_heuristic')),
  human_override_score REAL,
  human_note TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (answer_id)
);

-- Technical observations only. There is deliberately no score column and no link to answer_evaluations.
CREATE TABLE session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  duration_ms INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  observation TEXT NOT NULL,         -- neutral statement of what was observed
  interpretation TEXT NOT NULL,      -- explicit "unverified signal" caveat
  disputed INTEGER NOT NULL DEFAULT 0,
  dispute_note TEXT,
  disputed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_events_session ON session_events(session_id, occurred_at);

CREATE TABLE provider_configurations (
  id TEXT PRIMARY KEY CHECK (id IN ('mock', 'openai', 'anthropic', 'gemini')),
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL,
  api_key_enc TEXT,                  -- AES-256-GCM ciphertext; never returned to the browser
  is_default INTEGER NOT NULL DEFAULT 0,
  is_fallback INTEGER NOT NULL DEFAULT 0,
  candidate_data_ok INTEGER NOT NULL DEFAULT 0,  -- admin acknowledged candidate data may be sent here
  base_url TEXT,
  timeout_ms INTEGER NOT NULL DEFAULT 20000,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE usage_records (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  model TEXT,
  latency_ms INTEGER NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  success INTEGER NOT NULL,
  error_code TEXT,
  session_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_usage_provider ON usage_records(provider_id, created_at);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_audit_created ON audit_events(created_at);

CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES interview_sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('ai_processing', 'microphone', 'camera', 'video_diagnostics', 'integrity_monitoring', 'share_with_org')),
  granted INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_consent_user ON consent_records(user_id, session_id, type);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
