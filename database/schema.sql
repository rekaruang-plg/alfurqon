-- Empty schema, SQLite / Cloudflare D1 (not MySQL).
CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS records_kind ON records(kind);
CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY NOT NULL,student_id TEXT NOT NULL,exam_id TEXT NOT NULL,token_hash TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);
CREATE UNIQUE INDEX IF NOT EXISTS one_attempt ON attempts(student_id,exam_id);
CREATE UNIQUE INDEX IF NOT EXISTS unique_token ON attempts(token_hash);
CREATE INDEX IF NOT EXISTS attempts_exam ON attempts(exam_id);
CREATE TABLE IF NOT EXISTS demo_records (id TEXT PRIMARY KEY NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS demo_records_kind ON demo_records(kind);
CREATE TABLE IF NOT EXISTS demo_attempts (id TEXT PRIMARY KEY NOT NULL,student_id TEXT NOT NULL,exam_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,data TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 0,UNIQUE(student_id,exam_id));
CREATE INDEX IF NOT EXISTS demo_attempts_exam ON demo_attempts(exam_id);
