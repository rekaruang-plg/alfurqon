-- Generated once inside production; never returned to a browser or repository.
CREATE TABLE IF NOT EXISTS cbt.runtime_secrets (name text PRIMARY KEY, value text NOT NULL);
REVOKE ALL ON cbt.runtime_secrets FROM PUBLIC, anon, authenticated;
INSERT INTO cbt.runtime_secrets(name,value)
VALUES ('token-vault', encode(extensions.gen_random_bytes(32),'hex'))
ON CONFLICT DO NOTHING;
