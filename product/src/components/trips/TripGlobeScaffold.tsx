'use client'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronUp, Globe as GlobeIcon, Maximize2, Plane, Route } from 'lucide-react'
import type { RouteNode } from '@/lib/map/globeData'
import { lockBodyScroll } from '@/lib/scrollLock'

// Trip with the globe on top (round 3b of the redesign; the phone's
// GlobeScaffold, Patrik's 10 Oct decision A): the globe fills the top of Trip
// and the timeline scrolls up over it as one ordinary scroll. In that header
// the globe takes a tap only, never a drag: a tap opens it full screen, where
// it turns and zooms, with two round buttons (World, Replay) and a card at the
// bottom that brings the timeline back. Once the timeline covers the globe, a
// slim bar with the journey's name and a Globe button takes its place, and the
// globe stops drawing. Tapping a stop on the open globe folds it and scrolls
// to that stop's card. Solid surfaces where the phone uses glass (Petra, 12 Oct).

const TripGlobe = dynamic(() => import('./TripGlobe'), { ssr: false, loading: () => null })

/** The bar's height plus the safe area: the globe and the open overlay stop above it. */
const ABOVE_BAR = 'calc(76px + env(safe-area-inset-bottom))'
const glow = '[text-shadow:0_0_4px_var(--canvas),0_0_12px_var(--canvas)]'
const chip = 'inline-flex items-center gap-1.5 rounded-full border border-ln bg-sf px-[11px] py-1.5 text-[13px] font-medium text-tx2'

export function TripGlobeScaffold({ title, header, openHeader, peek, route, todayIso, onPickStop, children }: {
  title: string
  /** over the globe, closed: the kicker, the name and the gear */
  header: ReactNode
  /** over the open globe: the kicker and the name */
  openHeader: ReactNode
  /** the open globe's card: the stop, and one line under it */
  peek: { title: string; line: string }
  route: RouteNode[]
  todayIso: string
  /** a stop tapped on the open globe; the globe has folded by the time this is called */
  onPickStop: (node: RouteNode) => void
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [world, setWorld] = useState(false)
  const [cameraNonce, setCameraNonce] = useState(0)
  const [replayNonce, setReplayNonce] = useState(0)
  const [compact, setCompact] = useState(false)
  const [paused, setPaused] = useState(false)
  const [animating, setAnimating] = useState(false)
  const layerRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)
  useEffect(() => { openRef.current = open }, [open])

  // Where the globe's centre sits: a little below the header's middle, so the route
  // sits under the name (the phone's cyHeader); 40 % down the screen when open.
  // Set straight on the element on scroll, so the timeline does not re-render per frame.
  const place = useCallback(() => {
    const layer = layerRef.current, head = headRef.current
    if (!layer || !head) return
    const y = Math.max(0, window.scrollY)
    const headerH = head.offsetHeight
    const layerH = layer.offsetHeight
    if (openRef.current) {
      layer.style.transform = `translateY(${Math.round(layerH * 0.4 - layerH / 2)}px)`
      layer.style.opacity = '1'
    } else {
      layer.style.transform = `translateY(${Math.round(headerH * 0.55 - layerH / 2 - y * 0.5)}px)`
      layer.style.opacity = String(1 - Math.min(1, y / 320) * 0.75)
    }
    setCompact(!openRef.current && y > headerH - 70)
    setPaused(!openRef.current && y > headerH - 20)
  }, [])
  useEffect(() => {
    let raf = 0
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place() }) }
    place()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [place])
  useEffect(() => { place() }, [open, place])

  const settle = () => { setAnimating(true); setTimeout(() => setAnimating(false), 700) }
  const openGlobe = () => {
    if (openRef.current) return
    window.scrollTo({ top: 0 })
    setWorld(false)
    settle()
    setOpen(true)
    setCameraNonce((n) => n + 1)
  }
  const close = () => {
    if (!openRef.current) return
    setWorld(false)
    settle()
    setOpen(false)
    setCameraNonce((n) => n + 1)
  }

  // The open globe takes the whole screen: no page scroll under it, Escape closes.
  useEffect(() => {
    if (!open) return
    const unlock = lockBodyScroll()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); unlock() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const pick = (node: RouteNode) => {
    close()
    setTimeout(() => onPickStop(node), 450)
  }
  const replay = () => {
    if (playing) return
    setWorld(false)
    setPlaying(true)
    setReplayNonce((n) => n + 1)
  }
  const hasLegs = route.length > 1
  const ease = animating ? 'transition-[transform,opacity] duration-[650ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none' : ''
  const roundBtn = 'flex size-11 items-center justify-center rounded-full border border-ln bg-sf shadow-[0_3px_8px_rgba(0,0,0,.1)] disabled:opacity-50'

  return (
    <>
      {/* The globe, behind everything until it opens; it stops above the tab bar. */}
      <div
        ref={layerRef}
        className={'fixed inset-x-0 top-0 ' + ease + (open ? ' z-30' : ' z-0 pointer-events-none')}
        style={{ bottom: ABOVE_BAR }}
        aria-hidden={!open}
      >
        <TripGlobe
          route={route}
          todayIso={todayIso}
          interactive={open && !playing}
          paused={paused}
          camera={world ? 'world' : 'journey'}
          cameraNonce={cameraNonce}
          replayNonce={replayNonce}
          onReplayEnd={() => setPlaying(false)}
          onPickStop={pick}
        />
      </div>

      {/* The header over the globe, then the timeline as a sheet that scrolls up over it. */}
      <div
        className={'relative z-10 transition-transform duration-[550ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none'}
        style={open ? { transform: 'translateY(100dvh)', pointerEvents: 'none' } : undefined}
        aria-hidden={open}
        inert={open}
      >
        <div
          ref={headRef}
          role="button"
          tabIndex={0}
          aria-label="Open the globe"
          onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) openGlobe() }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGlobe() } }}
          className="relative cursor-pointer"
          style={{ height: 'max(240px, 40dvh)' }}
        >
          <div className={'px-4 pt-2 ' + glow}>{header}</div>
          <span className={chip + ' absolute bottom-[30px] right-3.5 bg-sf/90'}>
            <Maximize2 aria-hidden className="size-3.5" strokeWidth={2.2} /> Open the globe
          </span>
        </div>
        <div className="min-h-[62dvh] rounded-t-[24px] bg-canvas px-4 pb-6 pt-[18px] shadow-[0_-6px_14px_rgba(0,0,0,.08)]">
          {children}
        </div>
      </div>

      {/* Once the timeline covers the globe: the name, and a way back to the globe. */}
      <div
        className={'fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-ln bg-sf/95 px-4 pb-2.5 pt-[calc(10px+env(safe-area-inset-top))] backdrop-blur transition-opacity duration-200 ' + (compact && !open ? 'opacity-100' : 'pointer-events-none opacity-0')}
        aria-hidden={!compact || open}
      >
        <span className="min-w-0 truncate font-serif text-[17px] font-semibold text-tx">{title}</span>
        <button type="button" onClick={openGlobe} className={chip}>
          <GlobeIcon aria-hidden className="size-3.5" strokeWidth={2.2} /> Globe
        </button>
      </div>

      {/* The open globe: the name top left, World and Replay top right, the card at the bottom. */}
      {open && (
        <div className="lv-enter pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-col justify-between px-4 pb-2.5 pt-[calc(8px+env(safe-area-inset-top))]" style={{ bottom: ABOVE_BAR }}>
          <div className="flex items-start justify-between gap-3">
            <div className={'min-w-0 flex-1 ' + glow}>{openHeader}</div>
            <div className="pointer-events-auto flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => { setWorld((w) => !w); setCameraNonce((n) => n + 1) }}
                disabled={playing}
                aria-label={world ? 'Show the journey' : 'Show the world'}
                className={roundBtn + ' text-tx2'}
              >
                {world ? <Route aria-hidden className="size-[18px]" strokeWidth={2.2} /> : <GlobeIcon aria-hidden className="size-[18px]" strokeWidth={2.2} />}
              </button>
              <button type="button" onClick={replay} disabled={playing || !hasLegs} aria-label="Replay the journey" className={roundBtn + ' text-ac2-deep'}>
                <Plane aria-hidden className="size-[18px]" strokeWidth={2.2} />
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={playing}
            className="pointer-events-auto flex w-full items-center gap-2.5 rounded-[var(--r)] bg-sf px-4 py-3 text-left text-tx shadow-[0_6px_16px_rgba(0,0,0,.1)] disabled:opacity-70"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-serif text-[19px] font-semibold leading-tight">{peek.title}</span>
              {peek.line && <span className="mt-0.5 block truncate text-[13px] text-tx2">{peek.line}</span>}
            </span>
            <span className="flex flex-none items-center gap-1 text-[13px] font-medium text-ac">
              Timeline <ChevronUp aria-hidden className="size-3.5" strokeWidth={2.6} />
            </span>
          </button>
        </div>
      )}
    </>
  )
}
