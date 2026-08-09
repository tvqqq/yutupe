PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_subscriptions (
  channel_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'pending',
  lease_expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_channels (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channel_subscriptions(channel_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, channel_id)
);

CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  thumbnail_url TEXT,
  published_at TEXT,
  discovered_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_events_user_seq ON events(user_id, seq);
CREATE INDEX IF NOT EXISTS idx_user_channels_channel ON user_channels(channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_subscriptions_lease ON channel_subscriptions(lease_expires_at, updated_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
