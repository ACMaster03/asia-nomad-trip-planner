'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { Dot, Image as ImageIcon, MapPin, NotebookPen, PlaneLanding, RadioTower } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { followMediaUrl } from '@/lib/follow/api'
import type { FollowedEvent } from '@/lib/follow/follows'
import {
  addComment, deleteComment, fetchComments, fetchFeedSocial, fetchFollowedEvent, fetchSharedComments,
  fetchSharedEvent, react as sendReaction, reportComment, REACTION_KINDS, type PostComment, type PostSocial,
} from '@/lib/follow/social'
import { groupThread } from '@/lib/follow/thread'
import { tk } from '@/lib/trips/keys'
import { timeAgo } from '@/lib/trips/format'

// One post, opened. The same page whether you got here from Home, from a
// journey, or from the anonymous follow page: the full text, the photo, the
// six reactions (signed in), the comment thread with one level of replies.
//
// Visibility is decided server-side by the RPCs; this component only renders
// what comes back. Two modes:
//   auth — followed_event / feed_social / event_comments_list / add_comment
//   anon — shared_event / shared_event_comments, a "sign in to comment" line,
//          no reactions (an anonymous reader has no "who").

export type PostMode = { kind: 'auth'; userId: string } | { kind: 'anon'; token: string }

const EVENT_ICON: Record<string, LucideIcon> = {
  checkin: MapPin, note: NotebookPen, arrived: PlaneLanding, media: ImageIcon, location: RadioTower,
}
const card = 'rounded-[var(--r)] bg-sf'

export function eventTitle(e: FollowedEvent): string {
  if (e.kind === 'checkin') return e.payload.placeName ?? 'Checked in'
  if (e.kind === 'arrived') return `Arrived in ${e.payload.city ?? ''}`
  if (e.kind === 'note') return e.payload.text ?? 'Note'
  return 'Update'
}

function Stars({ n }: { n: number }) {
  return <span className="text-warn">{'★'.repeat(n)}<span className="text-ln3">{'★'.repeat(5 - n)}</span></span>
}

export default function PostView({ mode, eventId, initial }: { mode: PostMode; eventId: string; initial?: FollowedEvent | null }) {
  const sb = createClient()
  const qc = useQueryClient()

  const post = useQuery({
    queryKey: tk.post(eventId),
    queryFn: () => (mode.kind === 'auth' ? fetchFollowedEvent(sb, eventId) : fetchSharedEvent(sb, mode.token, eventId)),
    initialData: initial === undefined ? undefined : initial,
    staleTime: 60_000,
  })
  const social = useQuery({
    queryKey: tk.feedSocial([eventId]),
    queryFn: () => fetchFeedSocial(sb, [eventId]),
    enabled: mode.kind === 'auth' && post.data !== null,
    refetchInterval: 45_000,
  })
  const comments = useQuery({
    queryKey: tk.comments(eventId),
    queryFn: () => (mode.kind === 'auth' ? fetchComments(sb, eventId) : fetchSharedComments(sb, mode.token, eventId)),
    enabled: post.data !== null,
    refetchInterval: 45_000,
  })

  const mine = social.data?.[0]
  const reactMut = useMutation({
    mutationFn: (kind: string | null) => sendReaction(sb, eventId, kind),
    onSuccess: (row: PostSocial) => {
      qc.setQueryData(tk.feedSocial([eventId]), [row])
      qc.invalidateQueries({ queryKey: ['feed-social'] })
    },
  })

  const e = post.data
  if (post.isPending) return <p className="text-base text-tx2">Loading…</p>
  if (!e) {
    return (
      <section className={`${card} p-6 text-center`}>
        <h2 className="font-serif text-xl font-semibold">This post isn&apos;t available</h2>
        <p className="mx-auto mt-2 max-w-sm text-base leading-[1.55] text-tx2">
          It may have been removed, or it belongs to someone you don&apos;t follow.
        </p>
      </section>
    )
  }
  const Icon = EVENT_ICON[e.kind] ?? Dot
  const photos = e.payload.photos ?? []

  return (
    <div className="flex flex-col gap-3">
      <section className={`${card} p-4`}>
        <div className="flex items-start gap-3">
          <span className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[20px] bg-ac2-soft text-ac2-deep">
            <Icon className="size-5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 grow">
            <div className="text-base font-semibold text-ac2-deep">
              {e.authorName}
              <span className="font-medium text-tx3"> · {e.tripName}</span>
            </div>
            <h1 className="mt-0.5 font-serif text-[22px] font-semibold leading-[1.2]">{eventTitle(e)}</h1>
            {e.rating != null && <div className="mt-0.5 text-base"><Stars n={e.rating} /></div>}
            {e.comment && <p className="mt-1 text-base leading-[1.55] text-tx2">{e.comment}</p>}
            <p className="mt-1 text-base text-tx3">{timeAgo(e.occurred_at)}</p>
          </div>
        </div>
        {photos.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {photos.map((p) => (
              <a key={p} href={followMediaUrl(p)} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={followMediaUrl(p)} alt="" loading="lazy" className="max-h-[420px] w-full rounded-[14px] object-cover" />
              </a>
            ))}
          </div>
        )}
        {mode.kind === 'auth' && (
          <ReactionStrip
            mine={mine?.mine ?? null}
            tally={mine?.tally}
            busy={reactMut.isPending}
            onPick={(k) => reactMut.mutate(mine?.mine === k ? null : k)}
          />
        )}
      </section>

      <Thread
        mode={mode}
        eventId={eventId}
        flat={comments.data ?? null}
        pending={comments.isPending}
        canModerate={false}
      />

      <p className="rounded-[var(--r)] bg-tag p-3.5 text-base leading-[1.5] text-tag-ink">
        Anyone who can see this check-in can read the comments. Only people with an account can write.
      </p>
    </div>
  )
}

export function ReactionStrip({
  mine, tally, busy, onPick,
}: { mine: string | null; tally?: { kind: string; count: number }[]; busy: boolean; onPick: (kind: string) => void }) {
  const counts = new Map((tally ?? []).map((t) => [t.kind, t.count]))
  return (
    <div className="mt-3">
      <div className="flex gap-1.5">
        {REACTION_KINDS.map((k) => {
          const on = mine === k.key
          const n = counts.get(k.key)
          return (
            <button
              key={k.key}
              type="button"
              onClick={() => onPick(k.key)}
              disabled={busy}
              aria-pressed={on}
              aria-label={k.label}
              className={
                'flex h-11 flex-1 items-center justify-center gap-1 rounded-[12px] border text-lg disabled:opacity-60 ' +
                (on ? 'border-ac2 bg-ac2-soft' : 'border-ln bg-inp')
              }
            >
              <span aria-hidden>{k.glyph}</span>
              {n != null && <span className="text-[13px] font-semibold text-tx2">{n}</span>}
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-[13px] text-tx3">
        {mine ? `You reacted ${REACTION_KINDS.find((k) => k.key === mine)?.glyph ?? ''}` : 'Tap to react'}
        {tally && ' · counts are visible to the travellers only'}
      </p>
    </div>
  )
}

function Thread({
  mode, eventId, flat, pending,
}: { mode: PostMode; eventId: string; flat: PostComment[] | null; pending: boolean; canModerate: boolean }) {
  const sb = createClient()
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<PostComment | null>(null)
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState<string | null>(null)

  const add = useMutation({
    mutationFn: () => addComment(sb, eventId, body, replyTo?.id ?? null),
    onSuccess: () => {
      setBody('')
      setReplyTo(null)
      setError('')
      qc.invalidateQueries({ queryKey: tk.comments(eventId) })
      qc.invalidateQueries({ queryKey: ['feed-social'] })
    },
    onError: (err: Error) => setError(err.message || 'Could not post the comment'),
  })
  const del = useMutation({
    mutationFn: (id: string) => deleteComment(sb, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tk.comments(eventId) })
      qc.invalidateQueries({ queryKey: ['feed-social'] })
    },
  })
  const report = useMutation({
    mutationFn: (id: string) => reportComment(sb, id, 'reported from the post page'),
    onSuccess: () => setReporting(null),
  })

  useEffect(() => {
    if (replyTo) document.getElementById('comment-body')?.focus()
  }, [replyTo])

  const threads = groupThread(flat ?? [])
  const live = (flat ?? []).filter((c) => !c.deleted).length
  const me = mode.kind === 'auth' ? mode.userId : null

  return (
    <section className={`${card} p-4`}>
      <div className="text-base font-semibold uppercase tracking-[.12em] text-tx2">
        {pending ? 'Comments' : live === 1 ? '1 comment' : `${live} comments`}
      </div>
      {!pending && threads.length === 0 && (
        <p className="mt-2 text-base text-tx2">No comments yet.</p>
      )}
      <ul className="mt-1">
        {threads.map((t) => (
          <li key={t.comment.id} className="border-t border-ln py-2.5 first:border-t-0">
            <CommentRow c={t.comment} me={me} onReply={mode.kind === 'auth' ? () => setReplyTo(t.comment) : undefined}
              onDelete={mode.kind === 'auth' ? () => del.mutate(t.comment.id) : undefined}
              onReport={mode.kind === 'auth' ? () => setReporting(t.comment.id) : undefined} />
            {t.replies.length > 0 && (
              <ul className="ml-9 mt-1">
                {t.replies.map((r) => (
                  <li key={r.id} className="py-1.5">
                    <CommentRow c={r} me={me}
                      onDelete={mode.kind === 'auth' ? () => del.mutate(r.id) : undefined}
                      onReport={mode.kind === 'auth' ? () => setReporting(r.id) : undefined} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      {reporting && (
        <div className="mt-2 rounded-[14px] bg-warn-soft p-3 text-base">
          <p className="text-warn">Report this comment to the Livhold team?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => report.mutate(reporting)} disabled={report.isPending}
              className="rounded-full border-[1.4px] border-warn-line px-3 py-1.5 text-base font-medium text-warn">Report</button>
            <button type="button" onClick={() => setReporting(null)}
              className="rounded-full border-[1.4px] border-ln3 px-3 py-1.5 text-base font-medium text-tx2">Cancel</button>
          </div>
        </div>
      )}

      {mode.kind === 'auth' ? (
        <form
          className="mt-3"
          onSubmit={(ev) => {
            ev.preventDefault()
            if (body.trim()) add.mutate()
          }}
        >
          {replyTo && (
            <div className="mb-1.5 flex items-center justify-between text-[13px] text-tx2">
              <span>Replying to <b className="text-tx">{replyTo.authorName ?? 'a comment'}</b></span>
              <button type="button" onClick={() => setReplyTo(null)} className="text-ac2 font-semibold">Cancel</button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-[19px] border-[1.5px] border-ln2 bg-inp p-2 pl-3">
            <textarea
              id="comment-body"
              value={body}
              onChange={(ev) => setBody(ev.target.value)}
              rows={1}
              maxLength={2000}
              placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}
              className="min-h-[36px] grow resize-none bg-transparent text-base outline-none"
            />
            <button type="submit" disabled={add.isPending || !body.trim()}
              className="rounded-[14px] bg-ac px-3.5 py-2 text-[13px] font-semibold text-on disabled:opacity-50">
              {add.isPending ? '…' : 'Post'}
            </button>
          </div>
          {error && <p className="mt-1.5 text-base text-warn">{error}</p>}
        </form>
      ) : (
        <p className="mt-3 text-base text-tx2">
          <Link href={`/login`} className="font-semibold text-ac2">Sign in</Link> to comment.
        </p>
      )}
    </section>
  )
}

function CommentRow({
  c, me, onReply, onDelete, onReport,
}: { c: PostComment; me: string | null; onReply?: () => void; onDelete?: () => void; onReport?: () => void }) {
  if (c.deleted) {
    return <p className="text-base italic text-tx3">Comment removed</p>
  }
  const own = me != null && c.author === me
  return (
    <div className="flex gap-2.5">
      <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-ac2-soft text-[11px] font-bold text-ac2-deep">
        {(c.authorName ?? '?').slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 grow">
        <p className="text-base leading-[1.45]">
          <b className="font-semibold">{c.authorName}</b>
          {c.isTraveller && <span className="ml-1 text-[12px] font-medium text-tx3">traveller</span>}{' '}
          <span className="whitespace-pre-wrap">{c.body}</span>
        </p>
        <p className="mt-0.5 flex gap-3 text-[12px] text-tx3">
          <span>{timeAgo(c.created_at)}</span>
          {onReply && <button type="button" onClick={onReply} className="font-semibold text-ac2">Reply</button>}
          {own && onDelete && <button type="button" onClick={onDelete} className="font-semibold text-ac2">Delete</button>}
          {!own && onReport && <button type="button" onClick={onReport} className="font-semibold">Report</button>}
        </p>
      </div>
    </div>
  )
}
