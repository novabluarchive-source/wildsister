CREATE TABLE IF NOT EXISTS records (
 id TEXT PRIMARY KEY NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('signal','assessment','action','review','decision')),
 title TEXT NOT NULL,
 project TEXT NOT NULL DEFAULT '',
 payload TEXT NOT NULL CHECK(json_valid(payload)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS records_kind_created ON records(kind,created_at);
