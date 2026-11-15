CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL UNIQUE,
  salt TEXT NOT NULL,
  hash TEXT NOT NULL,
  created REAL NOT NULL
);
--> statement-breakpoint
CREATE TABLE auth_sessions (
  token TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  expires REAL NOT NULL
);
--> statement-breakpoint
CREATE INDEX auth_sessions_expiry ON auth_sessions(expires);
--> statement-breakpoint
CREATE TABLE journal_entries (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  created REAL NOT NULL,
  body TEXT NOT NULL,
  embedding TEXT NOT NULL,
  model TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX journal_entries_user ON journal_entries(user_id, created);
