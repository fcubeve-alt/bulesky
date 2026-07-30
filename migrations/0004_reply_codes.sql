-- Optional author handle on replies, so a reply can show "from ab***" just
-- like a bubble does. NULL when the replier stayed anonymous.
--
-- ADD COLUMN never touches existing rows, so it preserves data. It isn't
-- re-runnable on its own (SQLite has no ADD COLUMN IF NOT EXISTS), so the
-- deploy's migration step tolerates the specific "duplicate column name"
-- error on subsequent runs — see .github/workflows/deploy.yml.
ALTER TABLE replies ADD COLUMN code TEXT;
