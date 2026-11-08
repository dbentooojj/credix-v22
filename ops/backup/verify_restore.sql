-- psql -At -f verify_restore.sql prints exact row counts for every public table.
SELECT format(
  'SELECT %L AS table_name, count(*)::bigint AS row_count FROM %I.%I;',
  table_schema || '.' || table_name,
  table_schema,
  table_name
)
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name
\gexec
