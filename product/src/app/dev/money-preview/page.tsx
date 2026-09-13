import { notFound } from 'next/navigation'
import Preview from './Preview'

// DEV ONLY: renders the Money page from a fixture trip, no sign-in needed.
// Sign-in is magic-link only, so there is no other way to eyeball a screen
// with realistic data from a fresh browser. 404s outside development.
export default function MoneyPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <Preview />
}
