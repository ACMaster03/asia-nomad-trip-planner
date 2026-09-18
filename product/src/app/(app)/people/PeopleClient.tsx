'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchMyFollowing, unfollow } from '@/lib/follow/follows'
import { blockUser, fetchMyFollowers, removeFollower } from '@/lib/follow/social'
import { applyFilter, countryChips, rowFromFollower, rowFromFollowing, type PeopleFilter, type PersonRow } from '@/lib/follow/people'
import { tk } from '@/lib/trips/keys'
import { useToast } from '@/components/Toast'

type Tab = 'following' | 'followers'

const pill = 'rounded-full border-[1.4px] border-ln3 px-3 py-1.5 text-base font-medium text-tx2 disabled:opacity-50'

export default function PeopleClient({ initialTab }: { initialTab: Tab }) {
  const sb = createClient()
  const qc = useQueryClient()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PeopleFilter>({ kind: 'all' })
  const [confirm, setConfirm] = useState<{ row: PersonRow; action: 'unfollow' | 'remove' | 'block' } | null>(null)

  const following = useQuery({ queryKey: tk.following, queryFn: () => fetchMyFollowing(sb), staleTime: 60_000 })
  const followers = useQuery({ queryKey: tk.followers, queryFn: () => fetchMyFollowers(sb), staleTime: 60_000 })

  const rows = useMemo<PersonRow[]>(
    () => (tab === 'following' ? (following.data ?? []).map(rowFromFollowing) : (followers.data ?? []).map(rowFromFollower)),
    [tab, following.data, followers.data],
  )
  const chips = useMemo(() => countryChips(rows), [rows])
  const shown = useMemo(() => applyFilter(rows, filter, query), [rows, filter, query])
  const travelling = rows.filter((r) => r.state === 'on').length

  const act = useMutation({
    mutationFn: async ({ row, action }: NonNullable<typeof confirm>) => {
      if (action === 'unfollow') await unfollow(sb, row.user_id)
      else if (action === 'remove') await removeFollower(sb, row.user_id)
      else await blockUser(sb, row.user_id)
    },
    onSuccess: (_d, { row, action }) => {
      toast(
        action === 'unfollow' ? `You no longer follow ${row.name}` :
        action === 'remove' ? `${row.name} no longer follows you` :
        `${row.name} is blocked`,
      )
      setConfirm(null)
      qc.invalidateQueries({ queryKey: tk.following })
      qc.invalidateQueries({ queryKey: tk.followers })
      qc.invalidateQueries({ queryKey: tk.followingFeed })
    },
    onError: () => toast('That did not go through. Try again'),
  })

  const pending = tab === 'following' ? following.isPending : followers.isPending
  const failed = tab === 'following' ? following.isError : followers.isError

  return (
    <main className="lv-enter mx-auto flex max-w-xl flex-col gap-3 px-[18px] pb-6 pt-3">
      <Link href="/dashboard" className="-ml-1 inline-flex min-h-11 items-center gap-1 text-base font-semibold text-ac2">
        <ChevronLeft className="size-5" aria-hidden /> Home
      </Link>
      <h1 className="font-serif text-[25px] font-semibold">People</h1>

      <div role="tablist" className="flex gap-1 rounded-full bg-fill p-1">
        {(['following', 'followers'] as Tab[]).map((t) => {
          const n = t === 'following' ? following.data?.length : followers.data?.length
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => { setTab(t); setFilter({ kind: 'all' }) }}
              className={'flex-1 rounded-full py-2 text-base font-semibold ' + (tab === t ? 'bg-sf text-tx shadow-sm' : 'text-tx2')}
            >
              {t === 'following' ? 'Following' : 'Followers'}{n != null ? ` · ${n}` : ''}
            </button>
          )
        })}
      </div>

      <label className="flex items-center gap-2 rounded-[calc(var(--r)-3px)] border-[1.5px] border-ln2 bg-inp px-3">
        <Search className="size-4 flex-none text-tx3" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or place"
          aria-label="Search people"
          className="min-h-11 w-full bg-transparent text-base outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="text-tx3">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </label>

      {(travelling > 0 || chips.length > 0) && (
        <div className="-mx-[18px] flex gap-1.5 overflow-x-auto px-[18px] pb-0.5">
          <Chip on={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>All · {rows.length}</Chip>
          {travelling > 0 && (
            <Chip on={filter.kind === 'travelling'} onClick={() => setFilter({ kind: 'travelling' })}>Travelling · {travelling}</Chip>
          )}
          {chips.map((c) => (
            <Chip key={c.country} on={filter.kind === 'country' && filter.country === c.country} onClick={() => setFilter({ kind: 'country', country: c.country })}>
              {c.country} · {c.count}
            </Chip>
          ))}
        </div>
      )}

      {pending && <p className="text-base text-tx2">Loading…</p>}
      {failed && <p className="text-base text-warn">Could not load this list. Pull to refresh or try again later.</p>}
      {!pending && !failed && rows.length === 0 && (
        <section className="rounded-[var(--r)] bg-sf p-5 text-center">
          <p className="text-base leading-[1.55] text-tx2">
            {tab === 'following'
              ? 'You follow nobody yet. Open a link someone shared with you to follow them.'
              : 'Nobody follows you yet. Share a follow link from Account → Follow links.'}
          </p>
        </section>
      )}
      {!pending && rows.length > 0 && shown.length === 0 && (
        <p className="text-base text-tx2">Nobody matches.</p>
      )}
      {shown.length > 0 && (
        <ul className="rounded-[var(--r)] bg-sf px-3.5">
          {shown.map((r) => (
            <PersonRowView
              key={r.user_id}
              r={r}
              tab={tab}
              onAction={(action) => setConfirm({ row: r, action })}
            />
          ))}
        </ul>
      )}

      {confirm && (
        <div className="rounded-[var(--r)] bg-warn-soft p-4 text-base leading-[1.5]">
          <p className="text-warn">
            {confirm.action === 'unfollow' && `Stop following ${confirm.row.name}? You will no longer see their posts.`}
            {confirm.action === 'remove' && `Remove ${confirm.row.name}? They stop seeing your posts; they can follow you again through a link.`}
            {confirm.action === 'block' && `Block ${confirm.row.name}? They stop following you and none of your links open for them any more.`}
          </p>
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              disabled={act.isPending}
              onClick={() => act.mutate(confirm)}
              className="rounded-full border-[1.4px] border-warn-line px-3.5 py-1.5 text-base font-semibold text-warn disabled:opacity-50"
            >
              {act.isPending ? '…' : confirm.action === 'unfollow' ? 'Stop following' : confirm.action === 'remove' ? 'Remove' : 'Block'}
            </button>
            <button type="button" onClick={() => setConfirm(null)} className={pill}>Cancel</button>
          </div>
        </div>
      )}
    </main>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        'flex-none whitespace-nowrap rounded-full px-3 py-1.5 text-base font-medium ' +
        (on ? 'bg-ac2-soft text-ac2-deep' : 'border-[1.4px] border-ln3 text-tx2')
      }
    >
      {children}
    </button>
  )
}

function PersonRowView({ r, tab, onAction }: { r: PersonRow; tab: Tab; onAction: (a: 'unfollow' | 'remove' | 'block') => void }) {
  const [menu, setMenu] = useState(false)
  const where =
    r.state === 'paused' ? `${r.tripName} · paused`
    : r.city ? `${r.city}${r.country ? `, ${r.country}` : ''}`
    : r.tripName ? r.tripName
    : 'Not travelling'
  const inner = (
    <>
      <span className="flex size-9 flex-none items-center justify-center rounded-full bg-ac2-soft text-base font-bold text-ac2-deep">
        {r.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-semibold">{r.name}</span>
        <span className="block truncate text-base text-tx2">{where}</span>
      </span>
    </>
  )
  return (
    <li className="border-b border-ln last:border-b-0">
      <div className="flex items-center gap-2.5 py-[11px]">
        {tab === 'following' && r.trip_id ? (
          <Link href={`/journeys/${r.trip_id}`} className="flex min-w-0 flex-1 items-center gap-2.5">{inner}<ChevronRight className="size-4 flex-none text-ac2" aria-hidden /></Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">{inner}</div>
        )}
        <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label={`Options for ${r.name}`} className="flex-none rounded-full border-[1.4px] border-ln3 px-2.5 py-1 text-[13px] font-medium text-tx2">
          {menu ? 'Close' : tab === 'following' ? 'Following' : 'Follows you'}
        </button>
      </div>
      {menu && (
        <div className="-mt-1 mb-2.5 ml-[46px] flex flex-wrap gap-2">
          {tab === 'following' ? (
            <button type="button" onClick={() => { setMenu(false); onAction('unfollow') }} className={pill}>Stop following</button>
          ) : (
            <>
              <button type="button" onClick={() => { setMenu(false); onAction('remove') }} className={pill}>Remove</button>
              <button type="button" onClick={() => { setMenu(false); onAction('block') }} className={pill + ' border-warn-line text-warn'}>Block</button>
            </>
          )}
        </div>
      )}
    </li>
  )
}
