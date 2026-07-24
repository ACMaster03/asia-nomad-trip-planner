import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
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
        {/* Boot/update splash: SERVER-rendered so it paints before any JS
            (cold PWA starts, auto-update reloads); SWUpdate fades it out on
            hydration. The inline script swaps the label when this load was
            triggered by the auto-updater (sessionStorage flag from SWUpdate). */}
        <div id="anp-splash" aria-hidden="true">
          <div className="anp-splash-inner">
            <div className="anp-splash-icon">🧭</div>
            <div className="anp-splash-title">Asia Nomad Planner</div>
            <div className="anp-splash-sub" id="anp-splash-sub">Loading…</div>
          </div>
          <div className="anp-splash-ver">v{process.env.NEXT_PUBLIC_BUILD_SHA}</div>
        </div>
        {/* beforeInteractive = injected in <head>, so wait for the DOM when
            the splash div hasn't been parsed yet. Runs well before hydration
            either way — the label swaps while the splash is still visible. */}
        <Script id="anp-splash-mode" strategy="beforeInteractive">
          {"(function(){function f(){try{if(sessionStorage.getItem('anp-updating')){var el=document.getElementById('anp-splash-sub');if(el){el.textContent='✨ Updating to the latest version…'}sessionStorage.removeItem('anp-updating')}}catch(e){}}if(document.getElementById('anp-splash-sub')){f()}else{document.addEventListener('DOMContentLoaded',f)}})()"}
        </Script>
        {/* root-level: the follower page needs update auto-apply too */}
        <SWUpdate />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
