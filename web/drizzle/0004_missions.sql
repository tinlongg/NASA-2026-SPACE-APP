CREATE TABLE mission_profiles (
 user_id TEXT PRIMARY KEY NOT NULL,
 state TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 points INTEGER NOT NULL DEFAULT 0,
 listed INTEGER NOT NULL DEFAULT 0,
 alias TEXT NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE INDEX mission_ranking ON mission_profiles(listed,points DESC);
