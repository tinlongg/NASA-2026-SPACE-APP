ALTER TABLE journal_entries ADD COLUMN sleep_hours REAL;
--> statement-breakpoint
CREATE TABLE suit_checks (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  created REAL NOT NULL,
  overall TEXT NOT NULL,
  items TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX suit_checks_user ON suit_checks(user_id, created);
