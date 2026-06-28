'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function Login() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setSending(true)
    setMsg('Sending…')
    const sb = createClient()
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })
    setSending(false)
    setMsg(error ? `Error: ${error.message}` : '✓ Check your email for the sign-in link.')
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-sm place-items-center p-6">
      <form onSubmit={send} className="w-full space-y-3">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-neutral-500">
          Enter your email and we&apos;ll send a one-time magic link — no password.
        </p>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          disabled={sending}
          className="w-full rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send magic link
        </button>
        {msg && <p className="text-sm text-neutral-500">{msg}</p>}
      </form>
    </main>
  )
}
