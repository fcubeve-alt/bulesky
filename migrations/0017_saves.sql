-- Keeping somebody else's story, without taking a copy of it.
--
-- "别人的故事,你可以珍藏;自己的故事,你可以带走" — the brief's own line, and
-- the whole design follows from it. A save is a REFERENCE: two ids and who
-- saved it. No text is duplicated, so when an author deletes their whisper it
-- stops being readable for everyone at once, including the people who kept it.
-- Nobody ends up holding a permanent private copy of a stranger's worst night.
--
-- Keyed on author_hash — the same anonymous identity that owns whispers (see
-- 0014). So "my sky" needs no account, and losing the recovery code loses the
-- shelf along with everything else, which is the honest trade for having no
-- sign-up.
CREATE TABLE IF NOT EXISTS saves (
  author_hash TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('bubble', 'reply')),
  item_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (author_hash, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_saves_owner ON saves(author_hash, created_at);
