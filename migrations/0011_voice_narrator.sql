-- Which narrator read this whisper.
--
-- Not needed to play the audio back — the bytes are the bytes — but without it
-- there is no way to see what the classifier has been choosing, and no way to
-- tell a badly-cast reading from a badly-written one when tuning the voices.
--
-- SQLite has no ADD COLUMN IF NOT EXISTS, so re-running this migration errors
-- with "duplicate column name". The deploy workflow tolerates exactly that one
-- message and fails on anything else.
ALTER TABLE voice_chunks ADD COLUMN voice TEXT;
