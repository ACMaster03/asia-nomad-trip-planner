import Link from 'next/link'

export default function AuthCodeError() {
  return (
    <main className="mx-auto grid min-h-screen max-w-md place-items-center p-6 text-center">
      <div>
        <h1 className="mb-2 text-xl font-semibold">Sign-in link invalid or expired</h1>
        <p className="mb-4 text-sm text-neutral-500">
          The magic link couldn&apos;t be verified. Request a fresh one.
        </p>
        <Link href="/login" className="rounded border px-4 py-2 text-sm">
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
