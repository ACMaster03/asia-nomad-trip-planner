// The zoom from a card to its page (round 6 of docs/WEB-IOS-REDESIGN.md; the
// phone's Shell/Zoom.swift: a card grows into the screen it opens and shrinks
// back into place on the way out). The web's View Transitions API draws it:
// the tapped card and the page it opens carry the same `view-transition-name`,
// the browser snapshots the screen before and after the change and animates
// one box into the other, cross-fading the rest. Browsers without the API,
// and Reduce Motion, make the change at once, as before.
//
// The change itself is React's: a pushState the router follows, a push, a
// back, a state flip. None of them is done when its call returns, so the
// update callback waits (`until`) for the DOM to show the new screen before
// the browser takes its second snapshot. While it waits, the page is frozen
// as it was; the wait is capped so a slow screen costs at most a short pause
// and a plain cut, never a hang.
//
// `html.lv-vt` is set for the length of a transition (globals.css): the cards
// of the new screen then stand still for their snapshot instead of rising
// into it, and a sheet that is a zoom's destination does not slide as well.

type VTDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => { finished: Promise<void> }
}

export const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

// Apple's engine: Safari, and every browser on an iPhone or iPad (they all run
// on WebKit and report Apple as the vendor). On Petra's iPhone the first zoom
// (a stop card on Trip, 15 Oct, v5ae40f3) quit Safari outright, and with the
// API off (v70b4470) Latest → All entries still did. The cause was the
// settle's keyframes, not the zoom (globals.css, .lv-settle; docs/NOTES.md,
// 25 Oct), but until Patrik decides the zoom comes back these browsers get the
// plain cut they had before: no API, and no zoom name on any element
// (globals.css drops them under html.lv-no-vt, set by layout.tsx's boot script;
// the hooks below hand out none). Chrome and Android keep the zoom.
export const appleWebKit = () => typeof navigator !== 'undefined' && navigator.vendor === 'Apple Computer, Inc.'

/** Run `update` as a view transition where the browser can, at once where it cannot. */
export function viewTransition(update: () => void | Promise<void>): void {
  const doc = document as VTDocument
  if (!doc.startViewTransition || reduceMotion() || appleWebKit()) {
    void update()
    return
  }
  const html = document.documentElement
  html.classList.add('lv-vt')
  // Off a beat after the end: a card that mounted during the transition has
  // then finished the rise it was not drawing, instead of jumping into its last frames.
  const done = () => setTimeout(() => html.classList.remove('lv-vt'), 400)
  doc.startViewTransition(update).finished.then(done, done)
}

/**
 * Resolves once `test` is true, watching the document for the change; after
 * `ms` regardless. Not a frame loop: frames do not run while a view transition
 * waits for its update, DOM mutations still do.
 */
export function until(test: () => boolean, ms = 700): Promise<void> {
  if (test()) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      mo.disconnect()
      clearTimeout(timer)
      resolve()
    }
    const mo = new MutationObserver(() => { if (test()) finish() })
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-screen'] })
    const timer = setTimeout(finish, ms)
  })
}

/** The screen marked `data-screen=<name>` is in the document. */
export const untilShown = (screen: string, ms?: number) =>
  until(() => !!document.querySelector(`[data-screen="${screen}"]`), ms)

/** The screen marked `data-screen=<name>` has left the document. */
export const untilGone = (screen: string, ms?: number) =>
  until(() => !document.querySelector(`[data-screen="${screen}"]`), ms)

/** A `view-transition-name` from an id: letters, figures, `-` and `_` only, and never a figure first. */
export const vtName = (prefix: string, id: string) => `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`

// Which card a zoom started from, for the page that opens to take the same
// name while it is up (useZoomName in ./useZoom.ts), so that the way back
// shrinks it into the card it grew out of. Kept a few seconds: a tap whose page
// never came must not name the next page someone opens by another door.
let zoomFrom: { name: string; at: number } | null = null
const ZOOM_FROM_TTL = 3000

export const setZoomFrom = (name: string) => { if (!appleWebKit()) zoomFrom = { name, at: Date.now() } }
export const peekZoomFrom = (): string | undefined =>
  zoomFrom && Date.now() - zoomFrom.at < ZOOM_FROM_TTL ? zoomFrom.name : undefined
export const clearZoomFrom = () => { zoomFrom = null }
