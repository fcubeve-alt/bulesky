-- "Passing Light" (传递微光): a reader who doesn't want to type can leave a
-- soft light on a whisper — a zero-effort "I read this, I'm here" signal.
-- lights counts those; the client shows it only as glow (no number, no rank)
-- and gates one-per-device in localStorage.
--
-- ADD COLUMN preserves existing rows but isn't re-runnable on its own (SQLite
-- has no ADD COLUMN IF NOT EXISTS), so the deploy tolerates the specific
-- "duplicate column name" error on later runs — see .github/workflows/deploy.yml.
ALTER TABLE bubbles ADD COLUMN lights INTEGER NOT NULL DEFAULT 0;
