import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { fetchSharedEvent } from '@/lib/follow/social'
import PostView from '@/components/social/PostView'

// A post, opened from the anonymous follow page. Same token-is-the-credential
// rule as the page it came from: shared_event / shared_event_comments show
// exactly what the link shows, plus the thread, minus the composer.

export const metadata: Metadata = { robots: { index: false } }

export default async function SharedPostPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params
  const sb = await createClient()
  const initial = await fetchSharedEvent(sb, token, id).catch(() => undefined)
  return (
    <div className="min-h-dvh bg-pg text-tx">
      <main className="lv-enter mx-auto flex max-w-xl flex-col gap-3 px-4 py-6 sm:px-6">
        <Link href={`/follow/${token}`} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-base font-semibold text-ac2">
          <ChevronLeft className="size-5" aria-hidden /> Back to the journey
        </Link>
        <PostView mode={{ kind: 'anon', token }} eventId={id} initial={initial} />
      </main>
    </div>
  )
}
