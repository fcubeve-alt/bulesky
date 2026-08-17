-- The report queue.
--
-- Until now a report was a number: `report_count + 1`, and at three the content
-- disappeared. That is enough to keep the sky clean and it is NOT enough to run
-- a place people can be removed from — nobody could see what was reported, why,
-- whether anyone looked at it, or what was decided. Apple asks for exactly that
-- ("report objectionable content and act on it in a timely manner"), and so
-- does anyone who writes in to ask why their whisper is gone.
--
-- One row per report, kept even after the content is dealt with. The two
-- automatic paths (AI verdict, three reports) write their reason here too, so
-- the queue shows why something vanished without a human ever touching it.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL CHECK (item_type IN ('bubble', 'reply')),
  item_id INTEGER NOT NULL,
  -- What the reporter picked from the list, plus whatever the automatic paths
  -- concluded. Free text rather than an enum: the reasons will change, and a
  -- CHECK constraint on them means a migration every time they do.
  reason TEXT,
  -- 'open' until somebody decides. 'kept' / 'hidden' / 'deleted' afterwards.
  status TEXT NOT NULL DEFAULT 'open',
  -- What happened automatically at the moment of reporting: 'ai', 'count', or
  -- empty. Kept apart from `status` so "the machine hid this" and "a person
  -- agreed" never look like the same event.
  auto TEXT,
  note TEXT,
  created_at INTEGER NOT NULL,
  handled_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_item ON reports(item_type, item_id);
