import { redirect } from 'next/navigation'

// Root → the app. (A public marketing landing replaces this in Phase 3.)
export default function Home() {
  redirect('/dashboard')
}
