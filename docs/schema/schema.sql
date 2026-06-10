-- Zemen Dual Calendar — PostgreSQL Schema
-- Matches SQLAlchemy models exactly (auto-generated reference)

CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  email               VARCHAR(255) UNIQUE NOT NULL,
  full_name           VARCHAR(255),
  preferred_calendar  VARCHAR(20)  DEFAULT 'gregorian',
  timezone            VARCHAR(64)  DEFAULT 'UTC',
  language            VARCHAR(32)  DEFAULT 'en',
  hashed_password     VARCHAR(255) NOT NULL,
  google_email        VARCHAR(255),
  google_sub          VARCHAR(255),
  google_access_token  VARCHAR(2048),
  google_refresh_token VARCHAR(2048),
  google_token_expiry  TIMESTAMP,
  google_token_scope   VARCHAR(2048),
  google_oauth_state   VARCHAR(255),
  google_connected_at  TIMESTAMP,
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_users_email     ON users (email);
CREATE INDEX IF NOT EXISTS ix_users_google_sub ON users (google_sub);

-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS events (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version              INTEGER NOT NULL DEFAULT 1,
  title                VARCHAR(255) NOT NULL,
  description          TEXT,
  start_time_utc       TIMESTAMP NOT NULL,
  end_time_utc         TIMESTAMP,
  timezone             VARCHAR(64)  DEFAULT 'UTC',
  reminder_minutes     INTEGER      DEFAULT 60,
  recurrence_group_id  VARCHAR(36),
  recurrence_rule      VARCHAR(16),
  recurrence_interval  INTEGER,
  recurrence_byday     VARCHAR(64),
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_events_user_id              ON events (user_id);
CREATE INDEX IF NOT EXISTS ix_events_start_time_utc       ON events (start_time_utc);
CREATE INDEX IF NOT EXISTS ix_events_recurrence_group_id  ON events (recurrence_group_id);

-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_participants (
  id        SERIAL PRIMARY KEY,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role      VARCHAR(16) NOT NULL DEFAULT 'viewer',
  CONSTRAINT uq_event_participant UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_event_participants_event_id ON event_participants (event_id);
CREATE INDEX IF NOT EXISTS ix_event_participants_user_id  ON event_participants (user_id);

-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_snapshots (
  id               SERIAL PRIMARY KEY,
  event_id         INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version          INTEGER NOT NULL,
  title            VARCHAR(255) NOT NULL,
  description      TEXT,
  start_time_utc   VARCHAR(50) NOT NULL,
  end_time_utc     VARCHAR(50),
  timezone         VARCHAR(64) NOT NULL,
  reminder_minutes INTEGER,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_event_snapshots_event_id ON event_snapshots (event_id);

-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS holidays (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  category      VARCHAR(50)  NOT NULL DEFAULT 'public',
  calendar_type VARCHAR(20)  NOT NULL,
  g_year        INTEGER,
  g_month       INTEGER,
  g_day         INTEGER,
  e_year        INTEGER,
  e_month       INTEGER,
  e_day         INTEGER,
  resolved_date DATE NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_holidays_resolved_date ON holidays (resolved_date);

-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reminder_logs (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
  recipient_email VARCHAR(255) NOT NULL,
  sent_at         TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_reminder_logs_event_id ON reminder_logs (event_id);
