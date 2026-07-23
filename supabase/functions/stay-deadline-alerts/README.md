# Stay-deadline alerts — deployment

Emails trip members before a stay's **free-cancellation deadline** (T-7 / T-3 / T-1)
and **card-charge date** (T-1), via [Resend](https://resend.com). Dedupe in
`public.alert_log` (migration 08) — each alert sends at most once, ever.

## One-time setup (Patrik)

1. **Resend account** (free): sign up at resend.com → create an **API key**.
   The default `onboarding@resend.dev` sender works immediately for testing;
   verify a domain later for a proper from-address (set `ALERTS_FROM` secret).
2. **Set the function secrets** (per project — staging first):

   ```
   supabase secrets set --project-ref <REF> RESEND_API_KEY=<key> CRON_SECRET=<random-string>
   ```

3. **Deploy the function**:

   ```
   supabase functions deploy stay-deadline-alerts --project-ref <REF> --no-verify-jwt
   ```

   (`--no-verify-jwt` because pg_cron calls it with the shared `x-cron-secret`
   header instead of a user JWT — the function rejects anything without it.)

4. **Schedule it** — run ONCE per environment in the SQL editor / psql
   (migration 08 already enabled pg_cron + pg_net). 07:00 UTC = 09:00 CEST,
   14:00 ICT — morning either way for the travellers:

   ```sql
   select cron.schedule(
     'stay-deadline-alerts-daily',
     '0 7 * * *',
     $$
     select net.http_post(
       url     := 'https://<REF>.supabase.co/functions/v1/stay-deadline-alerts',
       headers := jsonb_build_object('Content-Type','application/json',
                                     'x-cron-secret','<same CRON_SECRET as above>'),
       body    := '{}'::jsonb
     );
     $$
   );
   ```

## Verify

- Manual fire: `curl -X POST https://<REF>.supabase.co/functions/v1/stay-deadline-alerts -H "x-cron-secret: <secret>"`
  → JSON `{date, sent, results}`.
- Seed a stay whose `cancelUntil` is tomorrow on a staging trip → run → email arrives; run again → `sent: 0` (dedupe).
- List jobs: `select jobname, schedule from cron.job;` · Unschedule: `select cron.unschedule('stay-deadline-alerts-daily');`

## Notes

- Refs: staging `fdcncqnklscbztcydtye`, prod `wvmnudcwcqktcugouqoe`.
- Recipients = trip owner + all `trip_members` (viewers included on purpose — a
  viewer partner still wants the warning).
- Out-of-plan stays (`include: false`) never alert.
- Web Push versions of these alerts arrive with M3; email stays as fallback.
