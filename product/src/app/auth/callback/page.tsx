import CallbackClient from './CallbackClient'

// PKCE code-exchange callback — handoff frame 06c ("Opening your trip…").
// A route handler cannot paint anything during the 1–2s exchange, so the
// exchange moved into a client page; the PKCE verifier lives in this
// browser's storage (set by signInWithOtp on /login), so the browser client
// is the natural place to redeem the code anyway.
export default function AuthCallbackPage() {
  return <CallbackClient />
}
