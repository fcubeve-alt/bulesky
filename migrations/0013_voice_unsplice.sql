-- Throw away the readings that could have been stitched together out of two.
--
-- `INSERT OR IGNORE` on (hash, part) let two syntheses of the same whisper
-- interleave when both listeners missed the cache at once: the winner's rows
-- stood, and the loser's rows filled in every part the winner did not have. The
-- cache is permanent, so a reading assembled that way is served that way
-- forever — which is what "the long ones have two voices in them" was.
--
-- Only a reading with more than one part can be a splice; a part is 900,000
-- bytes, so short whispers were never affected and are left alone. Whole
-- hashes, never single rows: deleting part of a reading would leave the rest of
-- it to be served as truncated audio, which is worse than the fault being fixed.
--
-- Bounded by date rather than by a flag, because migrations re-run on every
-- deploy and this must not go on quietly deleting long readings after today.
-- Anything cached from 2026-08-16 onwards was written by the fixed path, which
-- clears the hash inside the same batch and cannot interleave.
DELETE FROM voice_chunks
WHERE hash IN (
  SELECT hash FROM voice_chunks
  GROUP BY hash
  HAVING COUNT(*) > 1 AND MIN(created_at) < 1786838400000
);
