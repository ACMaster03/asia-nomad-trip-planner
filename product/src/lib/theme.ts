// Theme + text-size application, shared by the personalisation flow (P6) and
// Settings → Appearance (frame 27b / README: every personalisation answer
// lives in Settings too). localStorage keys and data attributes match the
// inline beforeInteractive resolver in app/layout.tsx, so a pick here applies
// instantly AND survives reloads.

export type Theme = 'Light' | 'Dark' | 'System'

export function applyTheme(theme: Theme) {
  const key = theme.toLowerCase()
  try {
    localStorage.setItem('lv-theme', key)
  } catch {}
  const dark = theme === 'Dark' || (theme === 'System' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}

export function applyLarger(on: boolean) {
  try {
    localStorage.setItem('lv-larger', on ? '1' : '')
  } catch {}
  document.documentElement.toggleAttribute('data-large', on)
}

// The stored choice, for screens (Settings) that render the current state.
// Unset behaves as System — same fallback as the layout resolver.
export function storedTheme(): Theme {
  try {
    const t = localStorage.getItem('lv-theme')
    if (t === 'dark') return 'Dark'
    if (t === 'light') return 'Light'
  } catch {}
  return 'System'
}

export function storedLarger(): boolean {
  try {
    return !!localStorage.getItem('lv-larger')
  } catch {
    return false
  }
}
