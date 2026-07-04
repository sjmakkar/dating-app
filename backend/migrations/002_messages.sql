-- ============================================================================
--  Phase 1 addendum — self-hosted chat messages.
--  The original spec kept messages in a managed provider (Stream/Sendbird).
--  For a zero-extra-cost MVP we store them here; the matches.chat_channel_id
--  still exists so a later switch to a managed provider is non-breaking.
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   uuid        NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id  uuid        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_match ON messages (match_id, created_at);
