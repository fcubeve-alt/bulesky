-- Lookups by author: "my whispers" in My Sky, and the ownership check on
-- delete. Both statements are IF NOT EXISTS, so this file is safe to re-run
-- and cannot fail the way 0014 did.
CREATE INDEX IF NOT EXISTS idx_bubbles_author ON bubbles(author_hash);
CREATE INDEX IF NOT EXISTS idx_replies_author ON replies(author_hash);
