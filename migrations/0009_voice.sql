-- Spoken readings of whispers, cached so each one is only ever paid for once.
--
-- Keyed by a hash of the exact text AND the exact voice settings used to speak
-- it, not by whisper id. A whisper's text never changes, so the first listener
-- pays for the synthesis and everyone after them gets the same bytes back for
-- free. That is also what bounds the cost: there are only so many whispers, and
-- no amount of replaying can charge us twice.
--
-- Changing the voice or the delivery instructions changes the hash, so old
-- readings simply stop being looked up rather than needing to be invalidated.
CREATE TABLE IF NOT EXISTS voice (
  hash TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voice_created ON voice(created_at);
