CREATE TABLE circles (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created REAL NOT NULL
);
--> statement-breakpoint
CREATE TABLE circle_members (
  circle_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined REAL NOT NULL,
  PRIMARY KEY (circle_id, user_id)
);
--> statement-breakpoint
CREATE INDEX circle_members_user ON circle_members(user_id);
--> statement-breakpoint
CREATE TABLE circle_invites (
  code_hash TEXT PRIMARY KEY NOT NULL,
  circle_id TEXT NOT NULL,
  expires REAL NOT NULL
);
--> statement-breakpoint
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created REAL NOT NULL
);
--> statement-breakpoint
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);
--> statement-breakpoint
CREATE TABLE circle_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  circle_id TEXT NOT NULL,
  created REAL NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX circle_alerts_lookup ON circle_alerts(circle_id, id);
