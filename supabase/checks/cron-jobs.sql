-- The scheduled jobs by name, and which auth shape each command uses.
-- Read-only. Run: tools/db.sh --prod sql supabase/checks/cron-jobs.sql
select jobid, jobname, schedule, active, username,
       case when command like '%x-cron-sig%'    then 'signed (30)'
            when command like '%x-cron-secret%' then 'RAW SECRET (pre-30)'
            else 'other' end as auth,
       substring(command from '/functions/v1/([a-z-]+)') as target
  from cron.job
 order by jobid;
