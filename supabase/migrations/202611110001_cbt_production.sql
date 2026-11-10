-- Private tables: the CBT server connects using the PostgreSQL pooler.
-- No REST/RPC endpoint or browser access is required.
BEGIN;
CREATE SCHEMA IF NOT EXISTS cbt;
REVOKE ALL ON SCHEMA cbt FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS cbt.records (
  id text PRIMARY KEY, kind text NOT NULL, data text NOT NULL, version integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS records_kind ON cbt.records(kind);
CREATE TABLE IF NOT EXISTS cbt.attempts (
  id text PRIMARY KEY, student_id text NOT NULL, exam_id text NOT NULL,
  token_hash text NOT NULL UNIQUE, data text NOT NULL, version integer NOT NULL DEFAULT 0,
  UNIQUE(student_id,exam_id)
);
CREATE INDEX IF NOT EXISTS attempts_exam ON cbt.attempts(exam_id);
CREATE TABLE IF NOT EXISTS cbt.demo_records (LIKE cbt.records INCLUDING ALL);
CREATE TABLE IF NOT EXISTS cbt.demo_attempts (LIKE cbt.attempts INCLUDING ALL);
REVOKE ALL ON ALL TABLES IN SCHEMA cbt FROM PUBLIC, anon, authenticated;
INSERT INTO cbt.records(id,kind,data) VALUES('year-2026/2027','year','{"name":"2026/2027"}') ON CONFLICT DO NOTHING;
COMMIT;
