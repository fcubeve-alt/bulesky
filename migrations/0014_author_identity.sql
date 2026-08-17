-- Who wrote this, in a way the server can actually check.
--
-- Until now "my whisper" existed only in the browser: a list of ids in
-- localStorage. The `code` column is a person's chosen NAME, not a secret —
-- 0003 deliberately dropped its UNIQUE constraint so one name can hold many
-- whispers, and `GET /api/bubbles/by-code/<name>` hands every whisper under a
-- name to anyone who types it. So the server had no way to tell an author from
-- a stranger, and "delete my balloon" and "only the author may share" could not
-- be built on top of it.
--
-- `author_hash` is SHA-256 of a secret the client keeps and never shows. The
-- secret is generated once per person, stored on their device, and shown to
-- them once as a recovery code so they can carry it to a new phone. Losing it
-- means losing the ability to delete — which is the honest cost of having no
-- accounts, and the product says so out loud rather than asking for an email.
--
-- Deliberately NOT unique and NOT indexed as an identity: many whispers share
-- one hash (that is the point — it is one person), and nothing else in the
-- schema references it.
ALTER TABLE bubbles ADD COLUMN author_hash TEXT;
ALTER TABLE replies ADD COLUMN author_hash TEXT;

-- When the author took it back.
--
-- A deleted whisper keeps `hidden = 1` as well, so every existing read path —
-- the sky, the detail view, replies, search, the voice endpoint — hides it with
-- no change at all. `deleted_at` is what separates "the author took this down"
-- from "this was hidden after reports", which the moderation queue will need
-- and which a boolean cannot express.
ALTER TABLE bubbles ADD COLUMN deleted_at INTEGER;
ALTER TABLE replies ADD COLUMN deleted_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_bubbles_author ON bubbles(author_hash);
CREATE INDEX IF NOT EXISTS idx_replies_author ON replies(author_hash);
