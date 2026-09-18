'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Dot, Image as ImageIcon, MapPin, MessageCircle, NotebookPen, PlaneLanding, RadioTower } from 'lucide-react'
import { followMediaUrl, type SharedEvent } from '@/lib/follow/api'
import { REACTION_KINDS, type PostSocial } from '@/lib/follow/social'
import { timeAgo } from '@/lib/trips/format'

// One follower-visible post as a feed row: the journey page, the anonymous
// follow page and Home's activity all draw it, so a post looks the same
// wherever it turns up. `href` opens the post page (signed in: /post/[id];
// anonymous: /follow/[token]/post/[id]); `social` adds the reaction chip and
// the comment count when the caller has them.

const EVENT_ICON: Record<string, LucideIcon> = {
  checkin: MapPin, note: NotebookPen, arrived: PlaneLanding, media: ImageIcon, location: RadioTower,
}

export function Stars({ n }: { n: number }) {
  return <span className="text-warn">{'★'.repeat(n)}<span className="text-ln3">{'★'.repeat(5 - n)}</span></span>
}

export function SocialRow({
  e, href, social, byline, tone = 'mauve', onReact, reacting,
}: {
  e: SharedEvent
  href: string
  social?: Pick<PostSocial, 'mine' | 'commentCount' | 'tally'> | null
  /** the line above the title: "Anna · Asia 2026" on Home, the author name on a journey */
  byline?: string
  /** mauve = someone else's post (people accent); tag = your own trip's row */
  tone?: 'mauve' | 'tag'
  /** present when the caller may react (signed in); opens the post page otherwise */
  onReact?: (kind: string | null) => void
  reacting?: boolean
}) {
  const Icon = EVENT_ICON[e.kind] ?? Dot
  const photos = e.payload.photos ?? []
  const tile = tone === 'mauve' ? 'bg-ac2-soft text-ac2-deep' : 'bg-tag text-tag-ink'
  const mineGlyph = social?.mine ? REACTION_KINDS.find((k) => k.key === social.mine)?.glyph : null
  const tallyTotal = social?.tally?.reduce((a, t) => a + t.count, 0) ?? 0

  return (
    <li className="border-b border-ln last:border-b-0">
      <Link href={href} className="flex items-start gap-3 py-[13px]">
        <span className={`flex h-[42px] w-[42px] flex-none items-center justify-center rounded-[20px] ${tile}`}>
          <Icon className="size-5" strokeWidth={2} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          {byline && <span className="block truncate text-[13px] font-semibold text-ac2-deep">{byline}</span>}
          <span className="block truncate text-base font-semibold">
            {e.kind === 'checkin' && (e.payload.placeName ?? 'Checked in')}
            {e.kind === 'arrived' && `Arrived in ${e.payload.city ?? ''}`}
            {e.kind === 'note' && (e.payload.text ?? 'Note')}
            {e.kind !== 'checkin' && e.kind !== 'arrived' && e.kind !== 'note' && 'Update'}
          </span>
          {e.rating != null && <span className="block text-base tracking-[.1em]"><Stars n={e.rating} /></span>}
          {e.comment && <span className="block text-base leading-snug text-tx2">{e.comment}</span>}
          {photos.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {photos.slice(0, 3).map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p} src={followMediaUrl(p)} alt="" loading="lazy" className="h-20 w-20 rounded-[14px] object-cover" />
              ))}
              {photos.length > 3 && (
                <span className="flex h-20 w-20 items-center justify-center rounded-[14px] bg-fill text-base font-semibold text-tx2">
                  +{photos.length - 3}
                </span>
              )}
            </span>
          )}
          <span className="block text-base text-tx2">{timeAgo(e.occurred_at)}</span>
        </span>
      </Link>
      {social && (
        <div className="-mt-1.5 mb-2.5 ml-[54px] flex flex-wrap items-center gap-2">
          {onReact ? (
            <ReactChip mine={social.mine ?? null} glyph={mineGlyph ?? null} total={tallyTotal} tally={social.tally} onReact={onReact} busy={!!reacting} />
          ) : tallyTotal > 0 ? (
            <span className="inline-flex h-8 items-center gap-1 rounded-full bg-fill px-2.5 text-[13px] font-semibold text-tx2">
              {(social.tally ?? []).slice(0, 3).map((t) => REACTION_KINDS.find((k) => k.key === t.kind)?.glyph).join('')} {tallyTotal}
            </span>
          ) : null}
          <Link href={href} className="inline-flex h-8 items-center gap-1 rounded-full bg-fill px-2.5 text-[13px] font-semibold text-tx2">
            <MessageCircle className="size-4" aria-hidden />
            {social.commentCount > 0 ? social.commentCount : 'Comment'}
          </Link>
        </div>
      )}
    </li>
  )
}

// The inline reaction chip: your own glyph (or "＋"). Tapping opens the six
// kinds right under the row; tapping the one you already have clears it. The
// tally beside the glyph is only there for travellers, because feed_social
// only sends it to them.
function ReactChip({
  mine, glyph, total, tally, onReact, busy,
}: { mine: string | null; glyph: string | null; total: number; tally?: PostSocial['tally']; onReact: (k: string | null) => void; busy: boolean }) {
  const [open, setOpen] = useState(false)
  const pick = (k: string) => {
    setOpen(false)
    onReact(mine === k ? null : k)
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-expanded={open}
        aria-label={mine ? `Your reaction: ${mine}. Tap to change` : 'React'}
        className={
          'inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold disabled:opacity-60 ' +
          (mine ? 'bg-ac2-soft text-ac2-deep' : 'bg-fill text-tx2')
        }
      >
        <span aria-hidden className="text-base leading-none">{glyph ?? '＋'}</span>
        {tally ? (
          <span>{(tally.slice(0, 3).map((t) => REACTION_KINDS.find((k) => k.key === t.kind)?.glyph ?? '').join(''))}{total > 0 ? ` ${total}` : ''}</span>
        ) : (
          mine ? null : <span>React</span>
        )}
      </button>
      {open && (
        <div role="group" aria-label="Pick a reaction" className="lv-enter flex gap-1">
          {REACTION_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => pick(k.key)}
              aria-label={k.label}
              aria-pressed={mine === k.key}
              className={
                'flex h-9 w-9 items-center justify-center rounded-full text-lg ' +
                (mine === k.key ? 'bg-ac2-soft ring-1 ring-ac2' : 'bg-fill')
              }
            >
              <span aria-hidden>{k.glyph}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
