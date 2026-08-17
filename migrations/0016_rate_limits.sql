-- A counter per caller per window, for the few endpoints where guessing pays.
--
-- The name lookup is the one that matters today: a name is a personal handle,
-- and `GET /api/bubbles/by-code/<name>` lists every whisper under it. The
-- byline in the sky is masked to its first two characters, so a name cannot
-- simply be read off the screen — but two characters plus unlimited tries is
-- not much of a lock, and people pick names that are easy to remember.
--
-- D1 rather than a KV or Durable Object binding: this table costs one small
-- write on an action people take a few times a day, and it needs no new
-- binding, no dashboard step and no second thing to configure before a deploy
-- works. If it ever becomes hot, that is the moment to move it, not before.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
