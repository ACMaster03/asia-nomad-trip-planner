import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { SWUpdate } from '@/components/SWUpdate'

export const metadata: Metadata = {
  title: 'Asia Nomad Planner',
  description: 'Plan a long Asia nomad trip on a shared knowledge base.',
  // PWA (M2): installable on iOS — Safari ignores most of the manifest and
  // wants these instead. standalone + touch icon = real home-screen app.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nomad',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#0d9488',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        {/* root-level: the follower page needs update auto-apply too */}
        <SWUpdate />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
