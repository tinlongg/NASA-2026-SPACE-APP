CREATE TABLE stations (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  room TEXT NOT NULL,
  join_code TEXT,
  join_expires REAL,
  device_hash TEXT,
  created REAL NOT NULL,
  last_seen REAL,
  report TEXT,
  last_alert TEXT
);
--> statement-breakpoint
CREATE INDEX stations_owner ON stations(owner_id);
--> statement-breakpoint
CREATE INDEX stations_code ON stations(join_code);
--> statement-breakpoint
CREATE TABLE station_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  to_device INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created REAL NOT NULL
);
--> statement-breakpoint
CREATE INDEX station_signals_lookup ON station_signals(station_id, to_device, id);
