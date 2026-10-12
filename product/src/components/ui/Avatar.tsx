import Link from 'next/link'

// The initial in a mauve circle, as the phone's Avatar (ios/Livhold/Components/
// Pills.swift): 42px, the initial at 17 semibold. On Home it is the door to
// Account, top right of the header; the saved first name wins over the email.
export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span
      aria-hidden
      className="flex flex-none items-center justify-center rounded-full bg-ac2-soft font-semibold text-ac2-deep"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initial}
    </span>
  )
}

export function AccountAvatar({ userName, userEmail }: { userName?: string | null; userEmail?: string | null }) {
  const name = userName?.trim() || userEmail?.trim() || ''
  return (
    <Link href="/account" aria-label="Account" title={name || 'Account'} className="flex flex-none rounded-full">
      <Avatar name={name} />
    </Link>
  )
}
