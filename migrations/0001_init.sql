-- Initial schema for 心灵星空 (working title)
-- Two content types share the same "bubble" shape: 'pain' (deep-blue-sea
-- confessions) and 'wish' (shooting-star wishes). warmth counts non-hidden
-- replies and drives the client-side color/tail-length animation.

CREATE TABLE IF NOT EXISTS bubbles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('pain', 'wish')),
  content TEXT NOT NULL,
  lang TEXT,
  warmth INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  crisis_flag INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bubbles_code ON bubbles(code);
CREATE INDEX IF NOT EXISTS idx_bubbles_created ON bubbles(created_at);
CREATE INDEX IF NOT EXISTS idx_bubbles_hidden ON bubbles(hidden);

CREATE TABLE IF NOT EXISTS replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bubble_id INTEGER NOT NULL REFERENCES bubbles(id),
  content TEXT NOT NULL,
  lang TEXT,
  report_count INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  crisis_flag INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_replies_bubble ON replies(bubble_id);
CREATE INDEX IF NOT EXISTS idx_replies_hidden ON replies(hidden);
