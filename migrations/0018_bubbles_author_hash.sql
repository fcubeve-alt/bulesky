-- Who wrote this whisper — SHA-256 of the secret the author's device keeps. See src/identity.js.
--
-- One statement per file, deliberately: D1 rolls back a whole file on any
-- error, so anything sharing a file shares its failures. See 0014.
ALTER TABLE bubbles ADD COLUMN author_hash TEXT;
