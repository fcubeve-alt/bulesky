-- Images used in blog posts, uploaded from the admin editor.
--
-- Stored in D1 rather than object storage: the project already has D1 wired up
-- everywhere, and a blog's worth of downscaled images (a few hundred KB each)
-- is small. The editor caps and re-compresses in the browser before upload, so
-- rows stay well inside D1's limits. If the blog ever carries hundreds of
-- photos, move the bytes to R2 and keep this table as the index — the public
-- URL (/media/<id>) would not change.
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_created ON images(created_at);
