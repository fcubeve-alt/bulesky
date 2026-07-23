-- Bubble codes are now matched case-insensitively (mobile keyboards
-- auto-capitalize text inputs, so typed casing can't be trusted to match
-- between creation and search). Normalize any codes written before this
-- change. Idempotent — safe to re-run.
UPDATE bubbles SET code = LOWER(code) WHERE code != LOWER(code);
