import { createBrowserClient } from '@supabase/ssr'

// createBrowserClient is internally memoized, so this is safe to call per-render.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
