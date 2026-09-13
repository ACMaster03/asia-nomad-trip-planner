// Background scroll lock for sheets and modals.
//
// `document.body.style.overflow = 'hidden'` is not a lock on iOS Safari: touch
// scrolling ignores it, so the page behind an open sheet still moved under the
// finger (phone report, 2026-09-13). The lock that holds everywhere is to fix
// the body in place at its current offset and put it back on release.
//
// Reference-counted so a sheet opened from a sheet (EntrySheet → CategoryPicker)
// locks once and releases only when the last one closes.

let depth = 0
let savedY = 0
let saved: Partial<Record<'position' | 'top' | 'left' | 'right' | 'width' | 'overflow', string>> = {}

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (depth++ === 0) {
    savedY = window.scrollY
    const s = document.body.style
    saved = { position: s.position, top: s.top, left: s.left, right: s.right, width: s.width, overflow: s.overflow }
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
    Object.assign(document.body.style, saved)
    window.scrollTo(0, savedY)
  }
}
