// Where a finished sign-in is allowed to land.
//
// Both auth entry points take a ?next= from the URL and redirect to it AFTER
// the session cookies are set, so an unvalidated value is an open redirect that
// hands a freshly authenticated visitor to whoever crafted the link. Anything
// but a plain same-origin path is refused here and replaced by the fallback.
//
// The rejected shapes are the ones a browser resolves off-site despite the
// leading slash: `//evil.com` and `/\evil.com` are both protocol-relative URLs
// under WHATWG parsing, and a control character can smuggle one past a check
// that only looks at the first two bytes.
export const DEFAULT_NEXT = '/dashboard'

function hasControlChars(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

export function safeNextPath(raw: string | null | undefined, fallback = DEFAULT_NEXT): string {
  if (!raw || !raw.startsWith('/')) return fallback
  if (raw[1] === '/' || raw[1] === '\\') return fallback
  if (hasControlChars(raw)) return fallback
  return raw
}
