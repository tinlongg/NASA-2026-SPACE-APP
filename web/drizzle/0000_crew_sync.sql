CREATE TABLE crew_sessions (
  token TEXT PRIMARY KEY NOT NULL,
  expires REAL NOT NULL,
  state TEXT,
  revision INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX crew_sessions_expiry ON crew_sessions(expires);
