-- When the author took it back. Kept apart from hidden so moderation can tell 'they deleted it' from 'we hid it'.
--
-- One statement per file, deliberately: D1 rolls back a whole file on any
-- error, so anything sharing a file shares its failures. See 0014.
ALTER TABLE bubbles ADD COLUMN deleted_at INTEGER;
