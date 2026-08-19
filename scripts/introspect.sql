-- Column inventory for scripts/gen-types.py, one row per column:
--   kind|relation|column|pg_type|notnull|has_default
--
-- kind is 'r' for a table and 'v' for a view. Ordered by relation then column
-- position so the generated file is stable across runs and diffs cleanly.
select
  c.relkind::text || '|' ||
  c.relname || '|' ||
  a.attname || '|' ||
  format_type(a.atttypid, a.atttypmod) || '|' ||
  case when a.attnotnull then 't' else 'f' end || '|' ||
  case when a.atthasdef then 't' else 'f' end
from pg_attribute a
join pg_class c on c.oid = a.attrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'v')
  and a.attnum > 0
  and not a.attisdropped
order by c.relkind desc, c.relname, a.attnum;
