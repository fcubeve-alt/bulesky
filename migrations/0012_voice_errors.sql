-- Why a reading failed, kept so the answer does not depend on someone
-- screenshotting a toast at the right moment.
--
-- Listen falls back to the browser voice on every failure by design, which is
-- right for the reader and useless for diagnosis: three rounds went by with
-- "still no sound" as the only available evidence. /api/voice/<id>?probe=1
-- reads the most recent rows back.
CREATE TABLE IF NOT EXISTS voice_errors (
  at INTEGER NOT NULL,
  provider TEXT,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_voice_errors_at ON voice_errors(at);
