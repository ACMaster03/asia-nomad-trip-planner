import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Lora, Work_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { SWUpdate } from '@/components/SWUpdate'

const lora = Lora({ subsets: ['latin'], variable: '--font-lora' })
const workSans = Work_Sans({ subsets: ['latin'], variable: '--font-work-sans' })

export const metadata: Metadata = {
  title: 'Livhold',
  description: 'The living journey, held together. Plan a long trip with a co-editor and hold on to it as you live it.',
  // PWA (M2): installable on iOS — Safari ignores most of the manifest and
  // wants these instead. standalone + touch icon = real home-screen app.
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Livhold',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f0eee9' },
    { media: '(prefers-color-scheme: dark)', color: '#12161a' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${workSans.variable} ${lora.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        {/* Theme resolver: the personalisation theme step stores 'light' |
            'dark' | 'system' under lv-theme; unset behaves as system. Resolved
            to data-theme on <html> before first paint so tokens + dark:
            utilities never flash the wrong theme. suppressHydrationWarning on
            <html> because this attribute is set outside React. */}
        <Script id="lv-theme" strategy="beforeInteractive">
          {"(function(){try{var t=localStorage.getItem('lv-theme');var d=t==='dark'||((!t||t==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}})()"}
        </Script>
        {/* Boot/update splash: SERVER-rendered so it paints before any JS
            (cold PWA starts, auto-update reloads); SWUpdate fades it out on
            hydration. The inline script swaps the label when this load was
            triggered by the auto-updater (sessionStorage flag from SWUpdate). */}
        <div id="anp-splash" aria-hidden="true">
          <div className="anp-splash-inner">
            <div className="anp-splash-icon">
              {/* eslint-disable-next-line @next/next/no-img-element -- pre-hydration splash, plain img on purpose */}
              <img src="/brand/livhold-mark.png" alt="" width={64} height={64} />
            </div>
            <div className="anp-splash-title">LIVHOLD</div>
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
