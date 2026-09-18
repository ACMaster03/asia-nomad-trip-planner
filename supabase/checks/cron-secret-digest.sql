-- Does the database's cron secret match the functions' CRON_SECRET, and what
-- do the scheduled jobs run? ONE statement, because the API path of db.sh
-- prints only the last statement's rows. Digests only, never the secret:
-- compare the cron_secret digest with the CRON_SECRET row of
--   supabase secrets list --project-ref <ref>
-- Read-only. Run: tools/db.sh --prod sql supabase/checks/cron-secret-digest.sql
select 'config:' || c.key                                   as what,
       'len=' || length(c.value)                             as detail,
       encode(sha256(convert_to(c.value, 'UTF8')), 'hex')   as digest_or_command
  from public.app_config c
 where c.key in ('functions_url', 'cron_secret')
union all
select 'cron:' || j.jobid,
       j.schedule || ' active=' || j.active,
       left(j.command, 220)
  from cron.job j
order by 1;
