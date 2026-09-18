import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fetchFollowedEvent } from '@/lib/follow/social'
import PostView from '@/components/social/PostView'

// A post, opened (signed in). Lives in the (app) group so the layout's auth
// guard applies; the RPC behind PostView decides whether this caller may see
// the post at all (travellers on their trip, followers on posts by people
// they follow).
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sb = await createClient()
  const { data } = await sb.auth.getClaims()
  const userId = (data?.claims?.sub as string | undefined) ?? ''
  // Server-seeded so the post paints with the page instead of after a
  // client round trip; the thread and reactions load in parallel from there.
  const initial = await fetchFollowedEvent(sb, id).catch(() => undefined)
  return (
    <main className="lv-enter mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-3">
      <Link href="/dashboard" className="-ml-1 inline-flex min-h-11 items-center gap-1 text-base font-semibold text-ac2">
        <ChevronLeft className="size-5" aria-hidden /> Back
      </Link>
      <PostView mode={{ kind: 'auth', userId }} eventId={id} initial={initial} />
    </main>
  )
}
