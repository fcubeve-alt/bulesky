-- A `code` is now a personal NAME/handle, not a per-post passphrase: one
-- person can post many whispers under the same name, and "find" lists all of
-- them. That means the old UNIQUE(code) constraint must go.
--
-- SQLite can't drop a column-level UNIQUE in place, so we rebuild the table.
-- Written to be safe to re-run: the deploy re-executes every migration file,
-- and this sequence always ends with a `bubbles` table holding the same rows
-- (just without the unique index). foreign_keys is toggled off so replies'
-- FK to bubbles(id) doesn't block the swap.
PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS bubbles_rebuild (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pain', 'wish')),
  content TEXT NOT NULL,
  lang TEXT,
  warmth INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  crisis_flag INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

INSERT INTO bubbles_rebuild (id, code, type, content, lang, warmth, report_count, hidden, crisis_flag, created_at)
  SELECT id, code, type, content, lang, warmth, report_count, hidden, crisis_flag, created_at FROM bubbles;

DROP TABLE bubbles;
ALTER TABLE bubbles_rebuild RENAME TO bubbles;

CREATE INDEX IF NOT EXISTS idx_bubbles_code ON bubbles(code);
CREATE INDEX IF NOT EXISTS idx_bubbles_created ON bubbles(created_at);
CREATE INDEX IF NOT EXISTS idx_bubbles_hidden ON bubbles(hidden);

PRAGMA foreign_keys=ON;
