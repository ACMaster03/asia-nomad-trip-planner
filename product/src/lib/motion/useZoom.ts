'use client'
import { useEffect, useState, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { clearZoomFrom, peekZoomFrom, setZoomFrom, untilShown, viewTransition } from './viewTransition'

/**
 * The name a page carries while it is up: the card it grew out of, if a zoom
 * opened it (lib/motion/viewTransition.ts). Read once, when the page mounts;
 * a page reached by any other door has none and simply cross-fades.
 */
export function useZoomName(): string | undefined {
  const [name] = useState(() => peekZoomFrom())
  useEffect(() => { clearZoomFrom() }, [])
  return name
}

/** Taps that open a page as a zoom from a card, and the way back into it. */
export function useZoom() {
  const router = useRouter()
  const plain = (e: MouseEvent) => e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0
  return {
    /**
     * onClick for a <Link>: the card named `from` grows into the screen marked
     * `data-screen=<screen>`. A modified click (new tab) is left to the browser.
     */
    link: (from: string, screen: string) => (e: MouseEvent<HTMLAnchorElement>) => {
      if (plain(e)) return
      const href = e.currentTarget.getAttribute('href')
      if (!href) return
      e.preventDefault()
      setZoomFrom(from)
      viewTransition(() => {
        router.push(href)
        return untilShown(screen)
      })
    },
    /**
     * onClick for a "‹ Back" link: the browser's back when the screen before this
     * one is the one the link names (lib/useCameFrom.ts), else a push to `href`;
     * either way drawn as the page shrinking into its card.
     */
    back: (canGoBack: () => boolean, href: string, screen: string) => (e: MouseEvent<HTMLAnchorElement>) => {
      if (plain(e)) return
      e.preventDefault()
      const back = canGoBack()
      viewTransition(() => {
        if (back) router.back()
        else router.push(href)
        return untilShown(screen)
      })
    },
  }
}
