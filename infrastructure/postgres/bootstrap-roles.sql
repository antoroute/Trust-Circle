\set ON_ERROR_STOP on
\set QUIET on

SELECT format('CREATE ROLE %I', 'trust_circle_migrator')
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_roles WHERE rolname = 'trust_circle_migrator'
 )
\gexec

SELECT format('CREATE ROLE %I', 'trust_circle_auth')
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_roles WHERE rolname = 'trust_circle_auth'
 )
\gexec

SELECT format('CREATE ROLE %I', 'trust_circle_messaging')
 WHERE NOT EXISTS (
   SELECT 1 FROM pg_roles WHERE rolname = 'trust_circle_messaging'
 )
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5',
  'trust_circle_migrator', :'migrator_password'
)
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20',
  'trust_circle_auth', :'auth_password'
)
\gexec

SELECT format(
  'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20',
  'trust_circle_messaging', :'messaging_password'
)
\gexec

ALTER ROLE trust_circle_migrator SET search_path = public, pg_catalog;
ALTER ROLE trust_circle_auth SET search_path = public, pg_catalog;
ALTER ROLE trust_circle_messaging SET search_path = public, pg_catalog;

SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'database_name')
\gexec
SELECT format(
  'GRANT CONNECT, CREATE ON DATABASE %I TO trust_circle_migrator',
  :'database_name'
)
\gexec
SELECT format(
  'GRANT CONNECT ON DATABASE %I TO trust_circle_auth, trust_circle_messaging',
  :'database_name'
)
\gexec

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO trust_circle_migrator WITH GRANT OPTION;
GRANT CREATE ON SCHEMA public TO trust_circle_migrator;
