-- Same for a reply.
--
-- One statement per file, deliberately: D1 rolls back a whole file on any
-- error, so anything sharing a file shares its failures. See 0014.
ALTER TABLE replies ADD COLUMN deleted_at INTEGER;
