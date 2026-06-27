/* Supabase connection — PUBLIC values only.
 *
 * The project URL and the *anon* key are safe to ship in client code and commit:
 * Row Level Security (see supabase/schema.sql) is what protects the data, not the
 * secrecy of these. NEVER put the service_role key here — it bypasses RLS.
 *
 * If cloud sync is ever disabled, just delete this file (or blank the values) and
 * the app falls back to local-only (localStorage + income.json).
 */
window.SUPABASE_URL = "https://wvmnudcwcqktcugouqoe.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bW51ZGN3Y3FrdGN1Z291cW9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1ODYxMDYsImV4cCI6MjA5ODE2MjEwNn0.q5XSLB65mYCg8kcgj00Fvp6WDUGNWxEmpBd166z-eZM";
