'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { humanAuthError } from '@/lib/auth/authError'
import { useToast } from '@/components/Toast'
import { Group, Row, rowCls } from '@/components/ui/SettingsList'

// Sign-in methods (the phone's row of the same name, round 5b): how you get
// in, and the password. An account starts with a magic link to a working
// email address, which is both the sign-up and the check that the address is
// real. A password is a SECOND key to a door you already have:
// `signInWithPassword` never creates an account, so nothing here is a way in
// for a stranger. (Corrected 2026-09-18: this used to say the project keeps
// signups closed. It does not, by design.)
//
// Two reasons it exists. Google Play requires reusable sign-in credentials
// for app review, and says so in as many words for apps gated behind one-time
// passwords, which is exactly what a magic link is. And on the road it is the
// more dependable way in: no mail server to wait on, and no link that can be
// opened in the wrong browser (the failure lib/supabase/otp.ts documents).
//
// Whether an account already HAS a password is not something Supabase tells
// the client, so this page never claims to know. It sets one either way,
// which is also what makes it the landing spot for a "forgot password" link
// (login/page.tsx sends the reset here).

const MIN_PASSWORD_LENGTH = 8
const field = 'min-w-0 flex-1 bg-transparent text-right text-base text-tx outline-none placeholder:text-tx3'

export default function SignInMethodsClient({ email }: { email: string }) {
  const sb = createClient()
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  const tooShort = pw.length > 0 && pw.length < MIN_PASSWORD_LENGTH
  const mismatch = confirm.length > 0 && pw !== confirm
  const ready = pw.length >= MIN_PASSWORD_LENGTH && pw === confirm

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sb.auth.updateUser({ password: pw })
      if (error) throw error
    },
    onSuccess: () => {
      setPw('')
      setConfirm('')
      setError('')
      toast('Password saved · you can sign in with it now')
    },
    onError: (e) => setError(humanAuthError(e, "We couldn't save the password just now. Please try again in a moment.")),
  })

  return (
    <main className="lv-enter mx-auto flex max-w-xl flex-col gap-4 px-4 pb-6 pt-[10px]">
      <div>
        <Link href="/account" className="-ml-1.5 inline-flex min-h-11 items-center text-base font-semibold text-ac2-deep">
          <ChevronLeft aria-hidden className="size-5" />Account
        </Link>
        <h1 className="font-serif text-[25px] font-semibold leading-[1.15] tracking-[-.01em]">Sign-in methods</h1>
      </div>

      <Group footer="A magic link to this address always works: tap the link in the email and you are in.">
        <Row label="Magic link"><span className="truncate">{email || 'your email'}</span></Row>
      </Group>

      <Group
        title="Password"
        footer={
          error ? <span className="text-warn">{error}</span>
            : mismatch ? <span className="text-warn">The two passwords don’t match.</span>
              : tooShort ? `At least ${MIN_PASSWORD_LENGTH} characters.`
                : 'Optional. A second way in, and the quicker one when the mail is slow to arrive. Set a new one here at any time.'
        }
      >
        <label className={rowCls}>
          <span className="flex-none">New password</span>
          <input className={field} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={`at least ${MIN_PASSWORD_LENGTH} characters`} />
        </label>
        <label className={rowCls}>
          <span className="flex-none">Confirm</span>
          <input className={field} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="type it again" />
        </label>
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !ready} className={rowCls + ' w-full text-left font-medium text-ac disabled:opacity-40'}>
          {save.isPending ? 'Saving…' : 'Save password'}
        </button>
      </Group>
    </main>
  )
}
