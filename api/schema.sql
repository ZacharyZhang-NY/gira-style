CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  system_prompt text,
  user_agent text,
  locale text,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(preferences) = 'object')
);

CREATE TABLE IF NOT EXISTS session_turns (
  turn_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  turn_index integer NOT NULL,
  user_message text NOT NULL,
  assistant_response jsonb NOT NULL,
  feedback text,
  image_key text,
  image_url text,
  video_key text,
  video_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(assistant_response) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS session_turns_session_index_idx
  ON session_turns (session_id, turn_index);

CREATE INDEX IF NOT EXISTS session_turns_session_id_idx
  ON session_turns (session_id);

CREATE INDEX IF NOT EXISTS sessions_created_at_idx
  ON sessions (created_at);
