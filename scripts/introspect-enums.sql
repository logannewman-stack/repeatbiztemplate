-- Enum inventory for scripts/gen-types.py: name|label,label,...
select t.typname || '|' || string_agg(e.enumlabel, ',' order by e.enumsortorder)
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
group by t.typname
order by t.typname;
