-- Cached readings, stored in pieces.
--
-- Replaces the single-row `voice` table from 0009, which had a defect that only
-- showed up on long whispers: D1 caps a single BLOB (and a single row) at
-- 2,000,000 bytes, and a minute of speech is comfortably more than that. The
-- insert failed, the failure was swallowed, and that whisper was then
-- re-synthesised — and re-charged — on every single play. The exact opposite of
-- the "pay once" the cache exists to provide.
--
-- Splitting across rows removes the ceiling rather than making it less likely to
-- be hit, so no whisper is ever too long to cache.
--
-- Dropping the old table is safe to repeat: migrations re-run on every deploy,
-- and nothing writes to `voice` any more. It never held a row in production
-- either — no TTS key was ever configured while it existed.
DROP TABLE IF EXISTS voice;

CREATE TABLE IF NOT EXISTS voice_chunks (
  hash TEXT NOT NULL,
  part INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (hash, part)
);

CREATE INDEX IF NOT EXISTS idx_voice_chunks_created ON voice_chunks(created_at);
