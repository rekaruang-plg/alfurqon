-- Move the existing relations, preserving IDs, constraints, indexes and data.
-- Keep the deployed CBT API and bootstrap script working through private views.
DO $migration$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['records', 'attempts', 'demo_records', 'demo_attempts', 'runtime_secrets']
  LOOP
    EXECUTE format('ALTER TABLE cbt.%I SET SCHEMA public', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('CREATE VIEW cbt.%I WITH (security_invoker = true) AS SELECT * FROM public.%I', t, t);
    EXECUTE format('REVOKE ALL ON cbt.%I FROM PUBLIC, anon, authenticated, service_role', t);
  END LOOP;
END;
$migration$;
