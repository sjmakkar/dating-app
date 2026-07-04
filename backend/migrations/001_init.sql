-- ============================================================================
--  Dating App — Phase 1 MVP schema
--  PostgreSQL + PostGIS. All IDs are UUID, all timestamps UTC (timestamptz).
--  Nine tables. Chat messages are NOT stored here — only a channel reference.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS postgis;       -- geography(Point) + GIST

-- ── enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE user_status      AS ENUM ('active', 'suspended', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE auth_provider    AS ENUM ('phone', 'google', 'apple');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE intent_type      AS ENUM ('serious', 'casual', 'friends');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE moderation_state AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE swipe_direction  AS ENUM ('like', 'pass');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE match_status     AS ENUM ('active', 'unmatched');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE report_status    AS ENUM ('open', 'reviewed', 'actioned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE device_platform  AS ENUM ('ios', 'android');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── users — the canonical person ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  status         user_status NOT NULL DEFAULT 'active',
  last_active_at timestamptz NOT NULL DEFAULT now()
);

-- ── auth_identities — one row per linked sign-in method ──────────────────
--  UNIQUE (provider, identifier) guarantees a sign-in method maps to ONE user.
CREATE TABLE IF NOT EXISTS auth_identities (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    auth_provider NOT NULL,
  identifier  text          NOT NULL,   -- E.164 phone, or provider's stable subject id
  email       text,                     -- optional; Apple may give a private relay
  created_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT uq_auth_provider_identifier UNIQUE (provider, identifier)
);
CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);

-- ── profiles — public-facing, 1:1 with users ────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  user_id      uuid                  PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text                  NOT NULL,
  birth_date   date                  NOT NULL,   -- 18+ enforced in app at write time
  gender       text                  NOT NULL,
  intent       intent_type           NOT NULL DEFAULT 'serious',
  bio          text,
  location     geography(Point, 4326),           -- (lng, lat); never returned raw
  city         text,
  is_verified  boolean               NOT NULL DEFAULT false,
  updated_at   timestamptz           NOT NULL DEFAULT now()
);
-- GIST index powers radius discovery.
CREATE INDEX IF NOT EXISTS idx_profiles_location ON profiles USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_profiles_city     ON profiles (city);

-- ── photos — ordered profile photos ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS photos (
  id                uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid             NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url               text             NOT NULL,   -- CDN URL, never direct storage
  position          int              NOT NULL DEFAULT 0,   -- 0 = primary
  moderation_status moderation_state NOT NULL DEFAULT 'pending',
  created_at        timestamptz      NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_photos_user ON photos(user_id, position);

-- ── swipes — directional like/pass ──────────────────────────────────────
--  UNIQUE (swiper, swipee): one decision per pair per direction-holder.
CREATE TABLE IF NOT EXISTS swipes (
  id         uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_id  uuid            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  swipee_id  uuid            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction  swipe_direction NOT NULL,
  created_at timestamptz     NOT NULL DEFAULT now(),
  CONSTRAINT uq_swipe_pair UNIQUE (swiper_id, swipee_id),
  CONSTRAINT chk_swipe_not_self CHECK (swiper_id <> swipee_id)
);
CREATE INDEX IF NOT EXISTS idx_swipes_swiper ON swipes(swiper_id);
CREATE INDEX IF NOT EXISTS idx_swipes_swipee ON swipes(swipee_id, direction);

-- ── matches — a mutual like; the chat anchor ────────────────────────────
--  Canonical ordering a_id < b_id guarantees exactly one match per pair.
CREATE TABLE IF NOT EXISTS matches (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id       uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id       uuid         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chat_channel_id text,
  status          match_status NOT NULL DEFAULT 'active',
  created_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT uq_match_pair UNIQUE (user_a_id, user_b_id),
  CONSTRAINT chk_match_canonical_order CHECK (user_a_id < user_b_id)
);
CREATE INDEX IF NOT EXISTS idx_matches_a ON matches(user_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_b ON matches(user_b_id);

-- ── blocks — one user blocking another (enforced both ways) ─────────────
CREATE TABLE IF NOT EXISTS blocks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_block_pair UNIQUE (blocker_id, blocked_id),
  CONSTRAINT chk_block_not_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);

-- ── reports — abuse/safety reports for moderators ───────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      text          NOT NULL,   -- harassment | fake | explicit | ...
  detail      text,
  status      report_status NOT NULL DEFAULT 'open',
  created_at  timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT chk_report_not_self CHECK (reporter_id <> reported_id)
);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id, status);

-- ── devices — push tokens per device ────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
  id         uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token  text            NOT NULL UNIQUE,
  platform   device_platform NOT NULL,
  updated_at timestamptz     NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id);

-- ── refresh_tokens — supports rotation + "log out everywhere" ───────────
--  (Not in the 9-table data model, but required to implement the token rules
--   in the spec's Security & Privacy notes. Stores only a hash of the token.)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text        NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
