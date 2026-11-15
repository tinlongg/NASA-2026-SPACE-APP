CREATE TABLE journal_photos (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL UNIQUE,
  created REAL NOT NULL,
  mime TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  data TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX journal_photos_user ON journal_photos(user_id, created);
