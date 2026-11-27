-- Existing attempts retain their inline snapshot. New attempts can store it
-- separately so autosave updates only the smaller progress payload.
BEGIN;
SET LOCAL lock_timeout = '2s';

DO $migration$
DECLARE
  table_name text;
  relation_kind "char";
BEGIN
  FOREACH table_name IN ARRAY ARRAY['attempts', 'demo_attempts'] LOOP
    SELECT relkind INTO STRICT relation_kind
    FROM pg_class
    WHERE oid = format('cbt.%I', table_name)::regclass;

    IF relation_kind = 'v' THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS question_data text', table_name);
      EXECUTE format(
        'CREATE OR REPLACE VIEW cbt.%1$I WITH (security_invoker=true) AS
         SELECT id, student_id, exam_id, token_hash, data, version, question_data FROM public.%1$I',
        table_name
      );
    ELSE
      EXECUTE format('ALTER TABLE cbt.%I ADD COLUMN IF NOT EXISTS question_data text', table_name);
    END IF;
  END LOOP;
END;
$migration$;

COMMIT;
