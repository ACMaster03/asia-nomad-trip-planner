// Background scroll lock for sheets and modals.
//
// `document.body.style.overflow = 'hidden'` is not a lock on iOS Safari: touch
// scrolling ignores it, so the page behind an open sheet still moved under the
// finger (phone report, 2026-09-13). The lock that holds everywhere is to fix
// the body in place at its current offset and put it back on release.
//
// Reference-counted so a sheet opened from a sheet (EntrySheet → CategoryPicker)
// locks once and releases only when the last one closes.
//
// THE LOCK IS LOAD-BEARING AND iOS IS NOT COMPLIANT. While the body is fixed,
// iOS may stop resolving `position: fixed` descendants against the viewport and
// resolve them against the body box instead, which begins at `-scrollY` and
// runs the full document height. That is what unpinned the bottom tab bar in
// #42: a navigation ran while a sheet was open, the lock outlived the screen
// that took it, and the tab bar went to the bottom of the document. #44 removed
// that navigation. The two guards below make a leak self-healing rather than
// permanent, because removing one trigger is not the same as being safe.

const PROPS = ['position', 'top', 'left', 'right', 'width', 'overflow'] as const
type Prop = (typeof PROPS)[number]

let depth = 0
let savedY = 0
let saved: Partial<Record<Prop, string>> = {}

/** Is the body currently held by a lock (ours or a leaked one)? */
const bodyIsLocked = () =>
  typeof document !== 'undefined' && document.body.style.position === 'fixed'

/**
 * The scroll offset a lock should restore to.
 *
 * `window.scrollY` is 0 while the body is fixed, so reading it to open a lock
 * over a LEAKED one records 0 and closing the sheet throws the reader to the
 * top of the page. When the body is already fixed, the true offset is the one
 * the previous lock wrote into `top`.
 */
function currentOffset(): number {
  if (!bodyIsLocked()) return window.scrollY
  const top = parseInt(document.body.style.top || '0', 10)
  return Number.isFinite(top) ? Math.abs(top) : 0
}

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {}

  // Self-heal the counter. If something released the body without going
  // through us (a navigation that threw away the tree mid-cleanup), depth is
  // stale and every future release would return early and leak forever.
  if (depth > 0 && !bodyIsLocked()) depth = 0

  if (depth++ === 0) {
    savedY = currentOffset()
    const s = document.body.style
    saved = Object.fromEntries(PROPS.map((k) => [k, s[k]])) as Partial<Record<Prop, string>>
    s.position = 'fixed'
    s.top = `-${savedY}px`
    s.left = '0'
    s.right = '0'
    s.width = '100%'
    s.overflow = 'hidden'
  }
  let released = false
  return () => {
    if (released) return
    released = true
    if (--depth > 0) return
    if (depth < 0) depth = 0
    Object.assign(document.body.style, saved)
    window.scrollTo(0, savedY)
  }
}

/**
 * Drop the lock unconditionally, whatever the count says.
 *
 * For the one case reference counting cannot cover: the tree holding the sheet
 * is gone and its cleanup never ran. A screen that knows no sheet can be open
 * calls this on mount, and a leak lasts until the next screen rather than
 * until the app is force-quit.
 */
export function forceReleaseBodyScroll(): void {
  if (typeof document === 'undefined' || !bodyIsLocked()) return
  const y = currentOffset()
  depth = 0
  Object.assign(document.body.style, saved)
  saved = {}
  window.scrollTo(0, y)
}
