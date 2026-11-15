CREATE TABLE call_contacts (
  user_id TEXT PRIMARY KEY NOT NULL,
  phone TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  consented REAL NOT NULL,
  last_called REAL
);
--> statement-breakpoint
CREATE TABLE call_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  created REAL NOT NULL,
  outcome TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX call_log_user ON call_log(user_id, created);
