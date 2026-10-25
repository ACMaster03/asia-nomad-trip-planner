// The session's cookies: `sb-<project ref>-auth-token`, split into `.0`, `.1`…
// when long. No such cookie means nobody to refresh. A lone PKCE verifier
// (`…-auth-token-code-verifier`) is a sign-in in progress, not a session.
export function hasSessionCookie(names: string[]): boolean {
  return names.some((n) => n.startsWith('sb-') && /-auth-token(\.\d+)?$/.test(n))
}
