import Link from 'next/link'
import { Hourglass } from 'lucide-react'

// Auth error — handoff frame 03: centered card on the 2b wash.
export default function AuthCodeError() {
  return (
    <main
      className="flex min-h-dvh flex-col justify-center px-6 py-7"
      style={{ background: 'var(--washLight)', color: 'var(--washInk)' }}
    >
      <div className="mx-auto w-full max-w-sm rounded-[calc(var(--r)+2px)] bg-sf px-6 py-7 text-center text-tx">
        <Hourglass aria-hidden className="mx-auto size-9" strokeWidth={2} />
        <h1 className="mt-3 text-[22px] font-semibold leading-tight">Sign-in link invalid or expired</h1>
        <p className="mt-2.5 text-base leading-relaxed text-tx2">
          The magic link couldn&apos;t be verified. Request a fresh one.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-block rounded-[calc(var(--r)-2px)] border-[1.5px] border-ac2 px-[22px] py-[13px] text-base font-semibold text-ac2"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
