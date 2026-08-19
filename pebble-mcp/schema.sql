CREATE TABLE IF NOT EXISTS captures (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	raw_text TEXT NOT NULL,
	tool_name TEXT NOT NULL,
	route TEXT NOT NULL DEFAULT 'uncategorized',
	status TEXT NOT NULL DEFAULT 'captured',
	result TEXT,
	detail TEXT,
	expansion TEXT
);

CREATE INDEX IF NOT EXISTS idx_captures_created_at ON captures (created_at DESC);

CREATE TABLE IF NOT EXISTS digests (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	period_start TEXT NOT NULL,
	period_end TEXT NOT NULL,
	content TEXT NOT NULL,
	capture_count INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_digests_created_at ON digests (created_at DESC);
