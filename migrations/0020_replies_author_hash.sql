-- Same for a reply: the words belong to whoever wrote them, and only they may take them back.
--
-- One statement per file, deliberately: D1 rolls back a whole file on any
-- error, so anything sharing a file shares its failures. See 0014.
ALTER TABLE replies ADD COLUMN author_hash TEXT;
