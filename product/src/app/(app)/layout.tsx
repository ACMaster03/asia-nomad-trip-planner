import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

// Server-side auth guard. The shared catalogue RLS is `to authenticated`, so an
// unauthenticated visitor would get zero rows; require a session here instead.
// Never rely on the proxy alone — re-check auth in the protected layout.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) redirect('/login')

  return (
    <div className="min-h-screen">
      <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
        <span className="font-semibold">🧭 Asia Nomad Planner</span>
        <Link href="/overview" className="hover:underline">Overview</Link>
        <Link href="/timeline" className="hover:underline">Timeline</Link>
        <Link href="/budget" className="hover:underline">Budget</Link>
        <Link href="/monthly" className="hover:underline">Monthly</Link>
        <Link href="/money" className="hover:underline">Money</Link>
        <Link href="/knowledge" className="hover:underline">Knowledge</Link>
        <Link href="/map" className="hover:underline">Map</Link>
      </nav>
      {children}
    </div>
  )
}
